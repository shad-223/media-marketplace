"""The only place that writes ledger entries. Call inside transaction.atomic()."""
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Account, Entry, JournalTransaction

K = Account.Kind


def account(user, kind) -> Account:
    acc, _ = Account.objects.get_or_create(user=user, kind=kind)
    return acc


def system(kind) -> Account:
    acc, _ = Account.objects.get_or_create(user=None, kind=kind)
    return acc


def balance(user, kind=K.AVAILABLE) -> Decimal:
    return account(user, kind).balance()


def post(kind, memo, legs, *, order=None, created_by=None, guard=()):
    """legs: [(Account, Decimal)]. guard: accounts that must not go negative.

    Locks the touched accounts (SELECT ... FOR UPDATE) so concurrent spends serialize.
    """
    legs = [(acc, Decimal(amt).quantize(Decimal("0.01"))) for acc, amt in legs if Decimal(amt) != 0]
    if sum(a for _, a in legs) != 0:
        raise ValueError("Unbalanced journal transaction")
    with transaction.atomic():
        ids = sorted({acc.id for acc, _ in legs})
        list(Account.objects.select_for_update().filter(id__in=ids).order_by("id"))
        for acc in guard:
            delta = sum(a for x, a in legs if x.id == acc.id)
            if acc.balance() + delta < 0:
                raise ValidationError({"detail": "Insufficient balance."})
        txn = JournalTransaction.objects.create(kind=kind, memo=memo[:255], order=order, created_by=created_by)
        Entry.objects.bulk_create([Entry(transaction=txn, account=acc, amount=amt) for acc, amt in legs])
    return txn
