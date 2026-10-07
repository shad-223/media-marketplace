from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import OneTimeCode, User
from apps.common.crypto import read_private_file, store_private_file
from apps.common.permissions import IsStaff, validate_upload
from apps.support.audit import log_admin
from apps.market.models import Listing, Review
from apps.market.serializers import ListingCardSerializer, SellerMiniSerializer
from apps.wallet import ledger
from apps.wallet.models import Account, Deposit, Withdrawal

from . import services
from .models import Dispute, Message, Order


class DisputeSerializer(serializers.ModelSerializer):
    opened_by = serializers.CharField(source="opened_by.username")

    class Meta:
        model = Dispute
        fields = ["id", "opened_by", "reason", "status", "resolution", "admin_note", "created_at", "resolved_at"]


class OrderSerializer(serializers.ModelSerializer):
    listing = ListingCardSerializer(read_only=True)
    buyer = SellerMiniSerializer(read_only=True)
    seller = SellerMiniSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    code = serializers.CharField(read_only=True)
    seller_net = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "code", "listing", "buyer", "seller", "amount", "fee", "seller_net", "status", "status_label",
            "transferred_at", "confirmed_at", "release_at", "closed_at", "created_at",
        ]


class OrderDetailSerializer(OrderSerializer):
    disputes = DisputeSerializer(many=True, read_only=True)
    reviews = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ["disputes", "reviews", "cancel_request"]

    cancel_request = serializers.SerializerMethodField()

    def get_cancel_request(self, obj):
        cr = obj.cancel_requests.select_related("requested_by").filter(status="pending").first()
        return {"id": cr.id, "requested_by": cr.requested_by.username, "reason": cr.reason, "created_at": cr.created_at} if cr else None

    def get_reviews(self, obj):
        return [{"reviewer": r.reviewer.username, "rating": r.rating, "comment": r.comment} for r in obj.reviews.select_related("reviewer")]


class MessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    has_attachment = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "sender", "role", "body", "has_attachment", "attachment_name", "created_at"]

    def get_sender(self, m):
        return m.sender.username if m.sender else "Media"

    def get_role(self, m):
        if not m.sender_id:
            return "system"
        o = self.context["order"]
        return "buyer" if m.sender_id == o.buyer_id else "seller" if m.sender_id == o.seller_id else "admin"

    def get_has_attachment(self, m):
        return bool(m.attachment_ref)

    def get_attachment_name(self, m):
        return m.attachment_ref.split("|")[1] if m.attachment_ref else None


def get_order_for(user, pk):
    order = get_object_or_404(Order.objects.select_related("listing__seller", "buyer", "seller"), pk=pk)
    if not (user.is_staff or user.id in (order.buyer_id, order.seller_id)):
        raise PermissionDenied()
    return order


class OrdersView(APIView):
    def get(self, request):
        services.release_due_orders()
        side = request.query_params.get("side", "buyer")
        qs = Order.objects.select_related("listing__seller", "buyer", "seller")
        qs = qs.filter(seller=request.user) if side == "seller" else qs.filter(buyer=request.user)
        if request.query_params.get("open"):
            qs = qs.filter(status__in=Order.OPEN)
        return Response(OrderSerializer(qs[:200], many=True).data)

    def post(self, request):
        order = services.open_order(request.user, request.data.get("listing"), request.data.get("offer") or None)
        return Response(OrderSerializer(order).data, status=201)


@api_view(["GET"])
def order_detail(request, pk):
    services.release_due_orders()
    order = get_order_for(request.user, pk)
    data = OrderDetailSerializer(order).data
    data["my_role"] = "buyer" if request.user.id == order.buyer_id else "seller" if request.user.id == order.seller_id else "admin"
    return Response(data)


@api_view(["POST"])
def order_action(request, pk):
    order = get_order_for(request.user, pk)
    action = request.data.get("action")
    if action == "transfer":
        services.mark_transferred(order, request.user)
    elif action == "confirm":
        if not OneTimeCode.consume(request.user, OneTimeCode.Purpose.HANDOVER, request.data.get("otp")):
            raise ValidationError({"otp": "Invalid or expired verification code."})
        services.confirm_handover(order, request.user)
    elif action == "dispute":
        services.open_dispute(order, request.user, request.data.get("reason") or "")
    elif action == "cancel_request":
        services.request_cancel(order, request.user, request.data.get("reason"))
    elif action in ("cancel_accept", "cancel_decline"):
        services.answer_cancel(order, request.user, accept=action == "cancel_accept")
    elif action == "cancel_withdraw":
        services.withdraw_cancel(order, request.user)
    elif action == "review":
        if order.status != Order.Status.COMPLETED or request.user.id not in (order.buyer_id, order.seller_id):
            raise ValidationError({"detail": "You can review once the trade is completed."})
        try:
            rating = int(request.data.get("rating"))
        except (TypeError, ValueError):
            rating = 0
        if not 1 <= rating <= 5:
            raise ValidationError({"rating": "Rate 1 to 5 stars."})
        other = order.seller if request.user.id == order.buyer_id else order.buyer
        Review.objects.update_or_create(
            order=order, reviewer=request.user,
            defaults={"reviewee": other, "rating": rating, "comment": (request.data.get("comment") or "")[:500]},
        )
    else:
        raise ValidationError({"action": "Unknown action."})
    order.refresh_from_db()
    return Response(OrderDetailSerializer(order).data)


class MessagesView(APIView):
    def get(self, request, pk):
        order = get_order_for(request.user, pk)
        qs = order.messages.select_related("sender")
        after = request.query_params.get("after")
        if after and after.isdigit():
            qs = qs.filter(id__gt=int(after))
        return Response(MessageSerializer(qs, many=True, context={"order": order}).data)

    def post(self, request, pk):
        order = get_order_for(request.user, pk)
        body = (request.data.get("body") or "").strip()
        f = request.FILES.get("file")
        if not body and not f:
            raise ValidationError({"body": "Write a message."})
        if order.status in (Order.Status.COMPLETED, Order.Status.REFUNDED) and not request.user.is_staff:
            if order.closed_at and timezone.now() - order.closed_at > timedelta(days=7):
                raise ValidationError({"detail": "This escrow room is closed."})
        validate_upload(f)
        m = Message.objects.create(
            order=order, sender=request.user, body=body[:4000] or "📎 Attachment",
            attachment_ref=store_private_file(f, "chat") if f else "",
        )
        if request.user.is_staff and request.user.id not in (order.buyer_id, order.seller_id):
            from apps.accounts.models import notify

            for u in (order.buyer, order.seller):
                notify(u, "Escrow agent replied", body[:120], f"/dashboard/orders/{order.pk}")
        return Response(MessageSerializer(m, context={"order": order}).data, status=201)


@api_view(["GET"])
def message_attachment(request, pk, mid):
    order = get_order_for(request.user, pk)
    m = get_object_or_404(Message, pk=mid, order=order)
    if not m.attachment_ref:
        return Response(status=404)
    data, name, ctype = read_private_file(m.attachment_ref)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'attachment; filename="{name}"'
    resp["Cache-Control"] = "no-store"
    return resp


# --- Admin --------------------------------------------------------------


class AdminOrders(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = OrderSerializer

    def get_queryset(self):
        services.release_due_orders()
        st = self.request.query_params.get("status", "open")
        qs = Order.objects.select_related("listing__seller", "buyer", "seller")
        if st == "open":
            return qs.filter(status__in=Order.OPEN)
        return qs if st == "all" else qs.filter(status=st)


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_order_action(request, pk):
    order = get_object_or_404(Order, pk=pk)
    note = (request.data.get("note") or "").strip()
    if not note:
        raise ValidationError({"note": "Add a note for both parties."})
    action = request.data.get("action")
    open_dispute = order.disputes.filter(status=Dispute.Status.OPEN).first()
    if open_dispute and action in ("release", "refund"):
        services.resolve_dispute(open_dispute, request.user, action, note)
    elif action == "release":
        services.release(order, by=request.user, reason=f"released by escrow agent: {note}")
    elif action == "refund":
        services.refund(order, by=request.user, reason=f"refunded by escrow agent: {note}")
    else:
        raise ValidationError({"action": "release or refund"})
    log_admin(request, f"order.{action}", order, f"{order.code} {action}d by escrow agent" + (" (dispute resolved)" if open_dispute else "") + f": {note}", amount=order.amount)
    order.refresh_from_db()
    return Response(OrderDetailSerializer(order).data)


def _support_queues():
    from apps.support.models import DeletionRequest, Report, Ticket

    return {
        "reports": Report.objects.filter(status=Report.Status.OPEN).count(),
        "tickets": Ticket.objects.filter(status=Ticket.Status.OPEN).count(),
        "deletions": DeletionRequest.objects.filter(status=DeletionRequest.Status.PENDING).count(),
    }


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_overview(request):
    services.release_due_orders()
    now = timezone.now()
    since = now - timedelta(days=13)
    completed = Order.objects.filter(status=Order.Status.COMPLETED)
    daily = {
        str(r["d"]): r
        for r in Order.objects.filter(created_at__gte=since.replace(hour=0, minute=0, second=0))
        .annotate(d=TruncDate("created_at"))
        .values("d")
        .annotate(n=Count("id"), gmv=Sum("amount"))
    }
    series = []
    for i in range(14):
        d = (since + timedelta(days=i)).date()
        r = daily.get(str(d), {})
        series.append({"date": str(d), "orders": r.get("n", 0), "gmv": str(r.get("gmv") or 0)})
    return Response(
        {
            "gmv": str(completed.aggregate(s=Sum("amount"))["s"] or 0),
            "revenue": str(ledger.system(Account.Kind.PLATFORM_REVENUE).balance()),
            "escrow_held": str(
                Account.objects.filter(kind=Account.Kind.ESCROW).aggregate(s=Sum("entries__amount"))["s"] or 0
            ),
            "completed_trades": completed.count(),
            "open_orders": Order.objects.filter(status__in=Order.OPEN).count(),
            "users": User.objects.count(),
            "verified_users": User.objects.filter(kyc_status=User.Kyc.VERIFIED).count(),
            "live_listings": Listing.objects.filter(status=Listing.Status.APPROVED).count(),
            "queues": {
                "kyc": User.objects.filter(kyc_status=User.Kyc.PENDING).count(),
                "listings": Listing.objects.filter(status=Listing.Status.PENDING).count(),
                "disputes": Dispute.objects.filter(status=Dispute.Status.OPEN).count(),
                "withdrawals": Withdrawal.objects.filter(status=Withdrawal.Status.PENDING).count(),
                "deposits": Deposit.objects.filter(status=Deposit.Status.PENDING).count(),
                **_support_queues(),
            },
            "series": series,
            "today_orders": Order.objects.filter(created_at__date=now.date()).count(),
        }
    )


class AdminDisputes(generics.ListAPIView):
    permission_classes = [IsStaff]

    def list(self, request):
        st = request.query_params.get("status", "open")
        qs = Dispute.objects.select_related("order__listing__seller", "order__buyer", "order__seller", "opened_by")
        if st != "all":
            qs = qs.filter(status=st)
        return Response(
            [{**DisputeSerializer(d).data, "order": OrderSerializer(d.order).data} for d in qs[:200]]
        )
