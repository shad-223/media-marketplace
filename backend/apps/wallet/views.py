from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import OneTimeCode, notify
from apps.common.permissions import IsStaff
from apps.support.audit import log_admin

from . import ledger
from .models import Account, Deposit, Entry, JournalTransaction, PaymentMethod, Withdrawal

K = Account.Kind
J = JournalTransaction.Kind


class DepositSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    user = serializers.CharField(source="user.username", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Deposit
        fields = [
            "id", "user", "method", "method_label", "amount", "sender", "reference", "status", "status_label", "note",
            "gateway", "gateway_ref", "gateway_amount", "gateway_currency", "created_at", "reviewed_at",
        ]


class WithdrawalSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    user = serializers.CharField(source="user.username", read_only=True)
    user_verified = serializers.BooleanField(source="user.is_verified", read_only=True)

    class Meta:
        model = Withdrawal
        fields = [
            "id", "user", "user_verified", "method", "method_label", "account_number", "account_name", "bank_name",
            "amount", "status", "payout_reference", "note", "created_at", "reviewed_at",
        ]


def _amount(v):
    try:
        a = Decimal(str(v)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        raise ValidationError({"amount": "Enter a valid amount."})
    if a <= 0:
        raise ValidationError({"amount": "Amount must be positive."})
    return a


@api_view(["GET"])
def summary(request):
    """Dashboard money + activity overview."""
    from apps.escrow.models import Order
    from apps.escrow.services import release_due_orders
    from apps.market.models import Listing, Offer, SavedListing

    release_due_orders()
    u = request.user
    seller_pending = Order.objects.filter(seller=u, status__in=Order.OPEN).aggregate(
        s=Sum("amount"), f=Sum("fee")
    )
    incoming = (seller_pending["s"] or 0) - (seller_pending["f"] or 0)
    return Response(
        {
            "available": str(ledger.balance(u, K.AVAILABLE)),
            "escrow_locked": str(ledger.balance(u, K.ESCROW)),
            "incoming_from_sales": str(incoming),
            "pending": str(ledger.balance(u, K.ESCROW) + incoming),
            "withdraw_in_progress": str(ledger.balance(u, K.WITHDRAW_HOLD)),
            "active_purchases": Order.objects.filter(buyer=u, status__in=Order.OPEN).count(),
            "active_sales": Order.objects.filter(seller=u, status__in=Order.OPEN).count(),
            "active_listings": Listing.objects.filter(seller=u, status=Listing.Status.APPROVED).count(),
            "pending_listings": Listing.objects.filter(seller=u, status=Listing.Status.PENDING).count(),
            "completed_trades": Order.objects.filter(Q(buyer=u) | Q(seller=u), status=Order.Status.COMPLETED).count(),
            "trade_volume": str(
                Order.objects.filter(Q(buyer=u) | Q(seller=u), status=Order.Status.COMPLETED).aggregate(s=Sum("amount"))["s"] or 0
            ),
            "open_bids": Offer.objects.filter(buyer=u, status__in=[Offer.Status.PENDING, Offer.Status.ACCEPTED]).count(),
            "offers_received": Offer.objects.filter(listing__seller=u, status=Offer.Status.PENDING).count(),
            "saved": SavedListing.objects.filter(user=u).count(),
        }
    )


@api_view(["GET"])
def transactions(request):
    """The user's ledger lines (one row per entry on their accounts), newest first."""
    entries = (
        Entry.objects.filter(account__user=request.user)
        .select_related("transaction", "account")
        .order_by("-transaction__created_at", "-id")[:300]
    )
    return Response(
        [
            {
                "id": e.id,
                "date": e.transaction.created_at,
                "kind": e.transaction.kind,
                "kind_label": e.transaction.get_kind_display(),
                "memo": e.transaction.memo,
                "account": e.account.kind,
                "account_label": e.account.get_kind_display(),
                "amount": str(e.amount),
                "order": e.transaction.order_id,
            }
            for e in entries
        ]
    )


@api_view(["GET"])
def methods(request):
    return Response([{"value": v, "label": label} for v, label in PaymentMethod.choices])


class DepositsView(APIView):
    def get(self, request):
        return Response(DepositSerializer(Deposit.objects.filter(user=request.user)[:100], many=True).data)

    def post(self, request):
        amount = _amount(request.data.get("amount"))
        method = request.data.get("method")
        if method not in PaymentMethod.values:
            raise ValidationError({"method": "Choose a payment method."})
        reference = (request.data.get("reference") or "").strip()[:60]
        if not reference:
            raise ValidationError({"reference": "Enter the transaction ID from your payment."})
        if amount > Decimal("5000000"):
            raise ValidationError({"amount": "Contact support for deposits above ৳50,00,000."})
        try:
            with transaction.atomic():
                dep = Deposit.objects.create(
                    user=request.user, method=method, amount=amount, reference=reference,
                    sender=(request.data.get("sender") or "")[:40],
                )
                if settings.PAYMENTS_SANDBOX:
                    _credit_deposit(dep, None, "Sandbox: credited instantly")
        except IntegrityError:
            raise ValidationError({"reference": "This transaction ID was already submitted."})
        return Response(DepositSerializer(dep).data, status=201)


def _credit_deposit(dep, admin, note=""):
    ledger.post(
        J.DEPOSIT,
        f"Deposit via {dep.get_method_display()} ({dep.reference})",
        [(ledger.system(K.GATEWAY), -dep.amount), (ledger.account(dep.user, K.AVAILABLE), dep.amount)],
        created_by=admin,
    )
    dep.status, dep.reviewed_by, dep.reviewed_at, dep.note = Deposit.Status.APPROVED, admin, timezone.now(), note
    dep.save()
    notify(dep.user, "Deposit credited", f"৳{dep.amount:,.2f} added to your available balance.", "/dashboard/wallet")


class WithdrawalsView(APIView):
    def get(self, request):
        return Response(WithdrawalSerializer(Withdrawal.objects.filter(user=request.user)[:100], many=True).data)

    def post(self, request):
        u = request.user
        amount = _amount(request.data.get("amount"))
        method = request.data.get("method")
        if method not in PaymentMethod.values or method == PaymentMethod.CARD:
            raise ValidationError({"method": "Withdraw to bKash, Nagad, Rocket or a bank account."})
        number = (request.data.get("account_number") or "").strip()
        name = (request.data.get("account_name") or "").strip()
        if not number or not name:
            raise ValidationError({"detail": "Account number and account holder name are required."})
        if method == PaymentMethod.BANK and not (request.data.get("bank_name") or "").strip():
            raise ValidationError({"bank_name": "Enter the bank name and branch."})
        from apps.common.models import get_site_settings

        min_withdrawal = get_site_settings().min_withdrawal
        if amount < min_withdrawal:
            raise ValidationError({"amount": f"Minimum withdrawal is ৳{min_withdrawal:,.0f}."})
        from apps.escrow.services import check_trade_limit

        check_trade_limit(u, amount)
        if not OneTimeCode.consume(u, OneTimeCode.Purpose.WITHDRAW, request.data.get("otp")):
            raise ValidationError({"otp": "Invalid or expired verification code."})
        with transaction.atomic():
            w = Withdrawal.objects.create(
                user=u, method=method, amount=amount, account_number=number[:40], account_name=name[:80],
                bank_name=(request.data.get("bank_name") or "")[:80],
            )
            avail = ledger.account(u, K.AVAILABLE)
            ledger.post(
                J.WITHDRAW_HOLD,
                f"Withdrawal #{w.pk} to {w.get_method_display()} {number}",
                [(avail, -amount), (ledger.account(u, K.WITHDRAW_HOLD), amount)],
                created_by=u,
                guard=[avail],
            )
        return Response(WithdrawalSerializer(w).data, status=201)


# --- Admin --------------------------------------------------------------


class AdminDeposits(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = DepositSerializer

    def get_queryset(self):
        st = self.request.query_params.get("status", "pending")
        qs = Deposit.objects.select_related("user")
        return qs if st == "all" else qs.filter(status=st)


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_deposit_decide(request, pk):
    with transaction.atomic():
        dep = get_object_or_404(Deposit.objects.select_for_update(), pk=pk, status=Deposit.Status.PENDING)
        note = (request.data.get("note") or "")[:300]
        if request.data.get("decision") == "approve":
            _credit_deposit(dep, request.user, note)
        else:
            if not note:
                raise ValidationError({"note": "Give a reason."})
            dep.status, dep.note, dep.reviewed_by, dep.reviewed_at = Deposit.Status.REJECTED, note, request.user, timezone.now()
            dep.save()
            notify(dep.user, "Deposit rejected", note, "/dashboard/wallet")
    log_admin(request, f"deposit.{dep.status}", dep, f"Deposit #{dep.pk} ৳{dep.amount} {dep.status} for @{dep.user.username}" + (f": {note}" if note else ""), amount=dep.amount)
    return Response(DepositSerializer(dep).data)


class AdminWithdrawals(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = WithdrawalSerializer

    def get_queryset(self):
        st = self.request.query_params.get("status", "pending")
        qs = Withdrawal.objects.select_related("user").order_by("created_at" if st == "pending" else "-created_at")
        return qs if st == "all" else qs.filter(status=st)


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_withdrawal_decide(request, pk):
    with transaction.atomic():
        w = get_object_or_404(Withdrawal.objects.select_for_update(), pk=pk, status=Withdrawal.Status.PENDING)
        note = (request.data.get("note") or "")[:300]
        hold = ledger.account(w.user, K.WITHDRAW_HOLD)
        if request.data.get("decision") == "paid":
            ref = (request.data.get("payout_reference") or "").strip()[:60]
            if not ref:
                raise ValidationError({"payout_reference": "Enter the payout transaction ID."})
            ledger.post(J.WITHDRAW_PAID, f"Withdrawal #{w.pk} paid ({ref})", [(hold, -w.amount), (ledger.system(K.GATEWAY), w.amount)], created_by=request.user)
            w.status, w.payout_reference = Withdrawal.Status.PAID, ref
            notify(w.user, "Withdrawal paid ✓", f"৳{w.amount:,.2f} sent to your {w.get_method_display()} ({ref}).", "/dashboard/wallet")
        else:
            if not note:
                raise ValidationError({"note": "Give a reason."})
            ledger.post(J.WITHDRAW_RETURN, f"Withdrawal #{w.pk} rejected", [(hold, -w.amount), (ledger.account(w.user, K.AVAILABLE), w.amount)], created_by=request.user)
            w.status = Withdrawal.Status.REJECTED
            notify(w.user, "Withdrawal rejected", f"{note} — the amount is back in your available balance.", "/dashboard/wallet")
        w.note, w.reviewed_by, w.reviewed_at = note, request.user, timezone.now()
        w.save()
    log_admin(request, f"withdrawal.{w.status}", w, f"Withdrawal #{w.pk} ৳{w.amount} {w.status} for @{w.user.username}" + (f" ref {w.payout_reference}" if w.payout_reference else "") + (f": {note}" if note else ""), amount=w.amount)
    return Response(WithdrawalSerializer(w).data)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_ledger_check(request):
    """Integrity check: every journal transaction must sum to zero."""
    from django.db.models import Count

    bad = (
        JournalTransaction.objects.annotate(total=Sum("entries__amount"), n=Count("entries"))
        .exclude(total=0)
        .values_list("id", flat=True)[:50]
    )
    total = Entry.objects.aggregate(s=Sum("amount"))["s"] or 0
    return Response({"balanced": not bad and total == 0, "unbalanced_transactions": list(bad), "grand_total": str(total)})
