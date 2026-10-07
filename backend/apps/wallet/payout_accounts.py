"""Saved withdrawal destinations and the user's own ledger CSV."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Entry, PaymentMethod, PayoutAccount

MAX_PAYOUT_ACCOUNTS = 10


class PayoutAccountSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = PayoutAccount
        fields = ["id", "method", "method_label", "account_number", "account_name", "bank_name", "label", "is_default", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_method(self, v):
        if v == PaymentMethod.CARD:
            raise serializers.ValidationError("Payouts go to bKash, Nagad, Rocket or a bank account.")
        return v

    def validate(self, data):
        method = data.get("method", getattr(self.instance, "method", None))
        bank = data.get("bank_name", getattr(self.instance, "bank_name", ""))
        if method == PaymentMethod.BANK and not (bank or "").strip():
            raise serializers.ValidationError({"bank_name": "Enter the bank name and branch."})
        return data


def _save(user, serializer):
    with transaction.atomic():
        obj = serializer.save(user=user)
        if obj.is_default:
            PayoutAccount.objects.filter(user=user).exclude(pk=obj.pk).update(is_default=False)
        elif not PayoutAccount.objects.filter(user=user, is_default=True).exists():
            obj.is_default = True
            obj.save(update_fields=["is_default"])
    return obj


@api_view(["GET", "POST"])
def payout_accounts(request):
    if request.method == "GET":
        return Response(PayoutAccountSerializer(PayoutAccount.objects.filter(user=request.user), many=True).data)
    if PayoutAccount.objects.filter(user=request.user).count() >= MAX_PAYOUT_ACCOUNTS:
        return Response({"detail": f"You can save up to {MAX_PAYOUT_ACCOUNTS} payout accounts."}, status=400)
    s = PayoutAccountSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    dup = PayoutAccount.objects.filter(
        user=request.user, method=s.validated_data["method"], account_number=s.validated_data["account_number"]
    ).first()
    if dup:
        return Response(PayoutAccountSerializer(dup).data)
    return Response(PayoutAccountSerializer(_save(request.user, s)).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def payout_account_detail(request, pk):
    acc = get_object_or_404(PayoutAccount, pk=pk, user=request.user)
    if request.method == "DELETE":
        was_default = acc.is_default
        acc.delete()
        if was_default:
            nxt = PayoutAccount.objects.filter(user=request.user).first()
            if nxt:
                nxt.is_default = True
                nxt.save(update_fields=["is_default"])
        return Response(status=204)
    s = PayoutAccountSerializer(acc, data=request.data, partial=True)
    s.is_valid(raise_exception=True)
    return Response(PayoutAccountSerializer(_save(request.user, s)).data)


@api_view(["GET"])
def export_transactions(request):
    from apps.market.seller import csv_response

    entries = (
        Entry.objects.filter(account__user=request.user)
        .select_related("transaction", "account")
        .order_by("-transaction__created_at", "-id")
    )
    rows = (
        (
            timezone.localtime(e.transaction.created_at).strftime("%Y-%m-%d %H:%M"),
            e.transaction.get_kind_display(),
            e.transaction.memo,
            e.account.get_kind_display(),
            e.amount,
            f"MD-{e.transaction.order_id:06d}" if e.transaction.order_id else "",
        )
        for e in entries.iterator()
    )
    return csv_response("media-transactions.csv", ["Date", "Type", "Description", "Balance", "Amount", "Order"], rows)
