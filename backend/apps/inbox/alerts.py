"""Saved-search alerts: notify buyers when a newly approved listing matches their filters."""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import notify

from .models import SavedSearch


def _dec(v):
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError, ValueError):
        return None


def matches(listing, params):
    from apps.market.models import CATEGORY_GROUP

    p = params or {}
    if p.get("category") and listing.category not in str(p["category"]).split(","):
        return False
    if p.get("group") and CATEGORY_GROUP.get(listing.category) != p["group"]:
        return False
    if p.get("q"):
        q = str(p["q"]).lower()
        if not any(q in (f or "").lower() for f in (listing.title, listing.niche, listing.description)):
            return False
    lo, hi = _dec(p.get("min_price")), _dec(p.get("max_price"))
    if lo is not None and listing.price < lo:
        return False
    if hi is not None and listing.price > hi:
        return False
    if str(p.get("min_audience", "")).isdigit() and listing.audience < int(p["min_audience"]):
        return False
    if p.get("verified") and not listing.is_verified:
        return False
    if p.get("monetized") and not listing.monetized:
        return False
    return True


def notify_matches(listing):
    """Run after a listing goes live. Never alerts the seller about their own listing."""
    hits = [s for s in SavedSearch.objects.exclude(user_id=listing.seller_id).select_related("user") if matches(listing, s.params)]
    notified = set()
    for s in hits:
        if s.user_id in notified:
            continue
        notified.add(s.user_id)
        notify(s.user, f"New match for “{s.name}”", listing.title, f"/listings/{listing.pk}")
    if hits:
        SavedSearch.objects.filter(id__in=[s.id for s in hits]).update(last_notified_at=timezone.now())
    return len(notified)


def schedule_alerts(listing):
    transaction.on_commit(lambda: notify_matches(listing))
