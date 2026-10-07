"""Online deposits through payment gateways (apps.wallet.gateways).

Flow: POST checkout -> Deposit(status=initiated) + redirect to the hosted page ->
gateway calls back (browser redirect, IPN or webhook) -> provider.verify() confirms
server-to-server -> complete() credits the ledger exactly once.
"""
import logging
import secrets
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

import requests

from . import gateways
from .models import Deposit, PaymentMethod
from .views import DepositSerializer, _amount, _credit_deposit

log = logging.getLogger(__name__)
MIN_ONLINE_DEPOSIT = Decimal("10")


def return_url(dep, result="success"):
    return f"{settings.PUBLIC_BASE_URL}/dashboard/wallet/return?deposit={dep.pk}&result={result}"


def complete(gw, res: gateways.VerifyResult):
    """Apply a verified gateway result to its Deposit. Idempotent; returns the Deposit or None."""
    if res.invoice:
        lookup = Q(reference=res.invoice)
    elif res.session:
        lookup = Q(gateway_session=res.session)
    else:
        return None
    with transaction.atomic():
        dep = Deposit.objects.select_for_update().filter(lookup, gateway=gw.name).first()
        if not dep:
            log.warning("%s callback for unknown deposit %s/%s", gw.name, res.invoice, res.session)
            return None
        if dep.status in (Deposit.Status.APPROVED, Deposit.Status.REJECTED):
            return dep  # already settled — replayed callback / IPN
        if res.session and dep.gateway_session and res.session != dep.gateway_session:
            log.warning("%s session mismatch for %s", gw.name, dep.reference)
            return dep
        if res.ok:
            if res.amount != dep.gateway_amount:
                dep.status = Deposit.Status.FAILED
                dep.gateway_ref = res.gateway_ref[:120]
                dep.note = f"Amount mismatch: gateway reported {res.amount} {dep.gateway_currency}, expected {dep.gateway_amount}. Review manually."
                dep.save()
                log.error("deposit %s amount mismatch: %s != %s", dep.reference, res.amount, dep.gateway_amount)
                return dep
            dep.gateway_ref = res.gateway_ref[:120]
            _credit_deposit(dep, None, f"Paid online via {gw.label} ({res.gateway_ref})"[:300])
        elif res.final and dep.status == Deposit.Status.INITIATED:
            dep.status = Deposit.Status.FAILED
            dep.note = (res.error or "Payment was not completed")[:300]
            dep.save()
    return dep


@api_view(["GET"])
def gateway_list(request):
    """Which deposit methods can be paid online right now, and which need the manual TrxID form."""
    out = []
    for value, label in PaymentMethod.choices:
        gw = gateways.for_method(value)
        out.append({"method": value, "label": label, "online": bool(gw), "gateway": gw.name if gw else None, "gateway_label": gw.label if gw else None, "currency": gw.currency if gw else "BDT"})
    return Response({"sandbox": settings.PAYMENTS_SANDBOX, "methods": out})


class CheckoutView(APIView):
    throttle_scope = "checkout"

    def post(self, request):
        method = request.data.get("method")
        if method not in PaymentMethod.values:
            raise ValidationError({"method": "Choose a payment method."})
        amount = _amount(request.data.get("amount"))
        if amount < MIN_ONLINE_DEPOSIT:
            raise ValidationError({"amount": f"Minimum online deposit is ৳{MIN_ONLINE_DEPOSIT}."})
        if amount > Decimal("5000000"):
            raise ValidationError({"amount": "Contact support for deposits above ৳50,00,000."})
        gw = gateways.for_method(method)
        if not gw:
            raise ValidationError({"detail": f"{PaymentMethod(method).label} isn't available online yet — use the manual transfer form."})
        dep = Deposit.objects.create(
            user=request.user, method=method, amount=amount, status=Deposit.Status.INITIATED,
            reference=f"MD{timezone.now():%y%m%d}{secrets.token_hex(5).upper()}",
            gateway=gw.name, gateway_amount=gw.gateway_amount(Deposit(amount=amount)), gateway_currency=gw.currency,
        )
        try:
            url = gw.start(dep, return_url(dep))
        except (gateways.GatewayError, requests.RequestException, ValueError) as e:
            log.exception("%s checkout failed", gw.name)
            dep.status, dep.note = Deposit.Status.FAILED, f"Could not start payment: {e}"[:300]
            dep.save()
            return Response({"detail": f"{gw.label} is not responding right now. Please try again or use the manual form."}, status=502)
        dep.checkout_url = url[:1000]
        dep.save(update_fields=["checkout_url", "gateway_session"])
        return Response({"deposit": DepositSerializer(dep).data, "redirect_url": url}, status=201)


@api_view(["GET"])
def deposit_detail(request, pk):
    """Polled by the return page. If the webhook hasn't landed yet, ask the gateway directly."""
    dep = get_object_or_404(Deposit, pk=pk, user=request.user)
    if dep.status == Deposit.Status.INITIATED and dep.gateway:
        gw = gateways.get(dep.gateway)
        try:
            res = gw.refresh(dep) if gw and gw.enabled() else None
            if res:
                complete(gw, res)
                dep.refresh_from_db()
        except (gateways.GatewayError, requests.RequestException):
            log.exception("refresh failed for %s", dep.reference)
    return Response(DepositSerializer(dep).data)


# --- Gateway callbacks (no auth: verified server-to-server) ---------------


def _browser_finish(gw, data):
    try:
        res = gw.verify(data)
        dep = complete(gw, res)
    except (gateways.GatewayError, requests.RequestException, ValueError):
        log.exception("%s callback verification error", gw.name)
        return HttpResponseRedirect(f"{settings.PUBLIC_BASE_URL}/dashboard/wallet/return?result=pending")
    if not dep:
        return HttpResponseRedirect(f"{settings.PUBLIC_BASE_URL}/dashboard/wallet/return?result=failed")
    result = {"approved": "success", "initiated": "pending"}.get(dep.status, "failed")
    return HttpResponseRedirect(return_url(dep, result))


@csrf_exempt
@require_GET
def bkash_callback(request):
    return _browser_finish(gateways.get("bkash"), request.GET.dict())


@csrf_exempt
@require_GET
def nagad_callback(request):
    return _browser_finish(gateways.get("nagad"), request.GET.dict())


@csrf_exempt
@require_POST
def sslcommerz_callback(request):
    return _browser_finish(gateways.get("sslcommerz"), request.POST.dict())


@csrf_exempt
@require_POST
def sslcommerz_ipn(request):
    gw = gateways.get("sslcommerz")
    try:
        complete(gw, gw.verify(request.POST.dict()))
    except (gateways.GatewayError, requests.RequestException, ValueError):
        log.exception("sslcommerz IPN error")
        return HttpResponse("retry", status=500)
    return HttpResponse("OK")


@csrf_exempt
@require_POST
def stripe_webhook(request):
    gw = gateways.get("stripe")
    res = gw.verify({"payload": request.body, "signature": request.META.get("HTTP_STRIPE_SIGNATURE", "")})
    if res.error == "Invalid Stripe signature":
        return HttpResponse("bad signature", status=400)
    if res.ok or res.final:
        complete(gw, res)
    return HttpResponse("OK")
