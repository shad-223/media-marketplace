"""Double-entry ledger.

Every money movement is one JournalTransaction whose Entries sum to exactly zero.
Entries are immutable; a balance is always SUM(entries) for an account.
Sign convention: +amount increases that account's balance.
The GATEWAY system account is the outside world, so it goes negative as deposits arrive.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum


class Account(models.Model):
    class Kind(models.TextChoices):
        AVAILABLE = "available", "Available balance"
        ESCROW = "escrow", "Locked in escrow (buyer)"
        WITHDRAW_HOLD = "withdraw_hold", "Withdrawal in progress"
        PLATFORM_REVENUE = "platform_revenue", "Platform commission"
        GATEWAY = "gateway", "Payment gateways (external)"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_accounts")
    kind = models.CharField(max_length=20, choices=Kind.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "kind"], name="uniq_user_account_kind"),
            models.UniqueConstraint(fields=["kind"], condition=models.Q(user__isnull=True), name="uniq_system_account_kind"),
        ]

    def __str__(self):
        return f"{self.user or 'SYSTEM'}:{self.kind}"

    def balance(self) -> Decimal:
        return self.entries.aggregate(s=Sum("amount"))["s"] or Decimal("0")


class JournalTransaction(models.Model):
    class Kind(models.TextChoices):
        DEPOSIT = "deposit", "Deposit"
        ESCROW_LOCK = "escrow_lock", "Payment into escrow"
        ESCROW_RELEASE = "escrow_release", "Escrow released"
        ESCROW_REFUND = "escrow_refund", "Escrow refunded"
        WITHDRAW_HOLD = "withdraw_hold", "Withdrawal requested"
        WITHDRAW_PAID = "withdraw_paid", "Withdrawal paid"
        WITHDRAW_RETURN = "withdraw_return", "Withdrawal rejected"
        ADJUSTMENT = "adjustment", "Adjustment"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    memo = models.CharField(max_length=255)
    order = models.ForeignKey("escrow.Order", null=True, blank=True, on_delete=models.PROTECT, related_name="journal")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Entry(models.Model):
    transaction = models.ForeignKey(JournalTransaction, on_delete=models.PROTECT, related_name="entries")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="entries")
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Ledger entries are immutable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Ledger entries are immutable")


class PaymentMethod(models.TextChoices):
    BKASH = "bkash", "bKash"
    NAGAD = "nagad", "Nagad"
    ROCKET = "rocket", "Rocket"
    BANK = "bank", "Bank transfer"
    CARD = "card", "Card / USD (Stripe)"


class Deposit(models.Model):
    class Status(models.TextChoices):
        INITIATED = "initiated", "Awaiting online payment"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Credited"
        REJECTED = "rejected", "Rejected"
        FAILED = "failed", "Payment failed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deposits")
    method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    sender = models.CharField(max_length=40, blank=True, help_text="Sending wallet number / account")
    reference = models.CharField(max_length=60, help_text="Gateway transaction ID (manual) or our invoice number (online)")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    # Online checkout (apps.wallet.gateways). Empty gateway = manual TrxID deposit.
    gateway = models.CharField(max_length=20, blank=True)
    gateway_session = models.CharField(max_length=120, blank=True, db_index=True, help_text="Gateway payment/session id")
    gateway_ref = models.CharField(max_length=120, blank=True, help_text="Gateway transaction id once paid")
    gateway_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Amount charged in gateway currency")
    gateway_currency = models.CharField(max_length=3, blank=True)
    checkout_url = models.URLField(max_length=1000, blank=True)
    note = models.CharField(max_length=300, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["method", "reference"], name="uniq_deposit_reference")]


class Withdrawal(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="withdrawals")
    method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    account_number = models.CharField(max_length=40)
    account_name = models.CharField(max_length=80)
    bank_name = models.CharField(max_length=80, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    payout_reference = models.CharField(max_length=60, blank=True)
    note = models.CharField(max_length=300, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
