"""Seller tools: listing gallery, featured requests, analytics and CSV export."""
import csv
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Max, Q, Sum
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.common.permissions import validate_upload

from .models import MAX_LISTING_IMAGES, Listing, ListingImage, ListingView, Offer

MAX_IMAGE_BYTES = 5 * 1024 * 1024
LOCKED = (Listing.Status.RESERVED, Listing.Status.SOLD)


class ListingImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ListingImage
        fields = ["id", "url", "order"]

    def get_url(self, obj):
        return obj.image.url if obj.image else None


def record_view(listing_id):
    """Bump today's view counter (called for non-owner views)."""
    today = timezone.localdate()
    updated = ListingView.objects.filter(listing_id=listing_id, date=today).update(count=F("count") + 1)
    if not updated:
        try:
            with transaction.atomic():
                ListingView.objects.create(listing_id=listing_id, date=today, count=1)
        except Exception:  # lost a create race: the row exists now
            ListingView.objects.filter(listing_id=listing_id, date=today).update(count=F("count") + 1)


def _own_listing(request, pk):
    listing = get_object_or_404(Listing, pk=pk)
    if listing.seller_id != request.user.id:
        raise PermissionDenied()
    return listing


@api_view(["GET", "POST"])
def listing_images(request, pk):
    listing = _own_listing(request, pk)
    if request.method == "GET":
        return Response(ListingImageSerializer(listing.images.all(), many=True).data)
    if listing.status in LOCKED:
        raise ValidationError({"detail": "Images can't change while the listing is in escrow or sold."})
    files = request.FILES.getlist("images") or request.FILES.getlist("image")
    if not files:
        raise ValidationError({"images": "Choose at least one image."})
    existing = listing.images.count()
    if existing + len(files) > MAX_LISTING_IMAGES:
        raise ValidationError({"images": f"A listing can have at most {MAX_LISTING_IMAGES} images ({existing} already uploaded)."})
    for f in files:
        validate_upload(f, images_only=True)
        if f.size > MAX_IMAGE_BYTES:
            raise ValidationError({"images": "Each image must be 5 MB or smaller."})
    start = (listing.images.aggregate(m=Max("order"))["m"] or 0) + 1 if existing else 0
    for i, f in enumerate(files):
        ListingImage.objects.create(listing=listing, image=f, order=start + i)
    return Response(ListingImageSerializer(listing.images.all(), many=True).data, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
def listing_image_delete(request, pk, image_id):
    listing = _own_listing(request, pk)
    if listing.status in LOCKED:
        raise ValidationError({"detail": "Images can't change while the listing is in escrow or sold."})
    img = get_object_or_404(ListingImage, pk=image_id, listing=listing)
    img.image.delete(save=False)
    img.delete()
    return Response(status=204)


@api_view(["POST"])
def listing_images_reorder(request, pk):
    listing = _own_listing(request, pk)
    if listing.status in LOCKED:
        raise ValidationError({"detail": "Images can't change while the listing is in escrow or sold."})
    ids = request.data.get("order") or []
    mine = set(listing.images.values_list("id", flat=True))
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        raise ValidationError({"order": "Send a list of image ids."})
    if set(ids) != mine:
        raise ValidationError({"order": "Send every image id of this listing exactly once."})
    for i, image_id in enumerate(ids):
        ListingImage.objects.filter(pk=image_id).update(order=i)
    return Response(ListingImageSerializer(listing.images.all(), many=True).data)


@api_view(["POST"])
def request_featured(request, pk):
    listing = _own_listing(request, pk)
    if listing.status != Listing.Status.APPROVED:
        raise ValidationError({"detail": "Only live listings can be featured."})
    if listing.is_featured:
        raise ValidationError({"detail": "This listing is already featured."})
    if listing.featured_requested_at:
        raise ValidationError({"detail": "You already requested featuring — our team will review it."})
    listing.featured_requested_at = timezone.now()
    listing.save(update_fields=["featured_requested_at"])
    return Response({"featured_requested_at": listing.featured_requested_at, "is_featured": listing.is_featured})


def _month_start(d):
    return d.replace(day=1)


def _shift_month(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    return d.replace(year=d.year + y, month=m + 1, day=1)


@api_view(["GET"])
def seller_stats(request):
    from apps.escrow.models import Order

    user = request.user
    today = timezone.localdate()
    since = today - timedelta(days=29)
    listings = list(
        Listing.objects.filter(seller=user)
        .annotate(
            saves=Count("saved_by", distinct=True),
            offers_total=Count("offers", distinct=True),
            offers_pending=Count("offers", filter=Q(offers__status=Offer.Status.PENDING), distinct=True),
            best_offer=Max("offers__amount", filter=Q(offers__status__in=[Offer.Status.PENDING, Offer.Status.ACCEPTED])),
        )
        .order_by("-created_at")
    )
    daily = defaultdict(dict)
    for v in ListingView.objects.filter(listing__seller=user, date__gte=since):
        daily[v.listing_id][v.date] = v.count
    days = [since + timedelta(days=i) for i in range(30)]
    totals_series = [0] * 30
    rows = []
    for l in listings:
        series = [daily[l.id].get(d, 0) for d in days]
        totals_series = [a + b for a, b in zip(totals_series, series)]
        rows.append(
            {
                "id": l.id,
                "title": l.title,
                "category": l.category,
                "status": l.status,
                "status_label": l.get_status_display(),
                "price": str(l.price),
                "views": l.views,
                "views_30d": sum(series),
                "series": series,
                "saves": l.saves,
                "offers_total": l.offers_total,
                "offers_pending": l.offers_pending,
                "best_offer": str(l.best_offer) if l.best_offer is not None else None,
                "is_featured": l.is_featured,
                "featured_requested_at": l.featured_requested_at,
            }
        )

    first = _shift_month(_month_start(today), -11)
    months = [_shift_month(first, i) for i in range(12)]
    earned = defaultdict(lambda: Decimal("0"))
    sold_count = defaultdict(int)
    for closed_at, amount, fee in Order.objects.filter(
        seller=user, status=Order.Status.COMPLETED, closed_at__date__gte=first
    ).values_list("closed_at", "amount", "fee"):
        key = timezone.localtime(closed_at).date().replace(day=1)
        earned[key] += amount - fee
        sold_count[key] += 1
    completed = Order.objects.filter(seller=user, status=Order.Status.COMPLETED).aggregate(
        gross=Sum("amount"), fee=Sum("fee"), n=Count("id")
    )
    open_orders = Order.objects.filter(seller=user, status__in=Order.OPEN).aggregate(gross=Sum("amount"), fee=Sum("fee"))
    return Response(
        {
            "totals": {
                "listings": len(rows),
                "live": sum(1 for r in rows if r["status"] == Listing.Status.APPROVED),
                "views": sum(r["views"] for r in rows),
                "views_30d": sum(totals_series),
                "saves": sum(r["saves"] for r in rows),
                "offers_pending": sum(r["offers_pending"] for r in rows),
                "sales": completed["n"],
                "earned": str((completed["gross"] or 0) - (completed["fee"] or 0)),
                "pending_incoming": str((open_orders["gross"] or 0) - (open_orders["fee"] or 0)),
            },
            "views_series": [{"date": str(d), "views": n} for d, n in zip(days, totals_series)],
            "earnings_by_month": [
                {"month": f"{m:%Y-%m}", "earned": str(earned[m]), "sales": sold_count[m]} for m in months
            ],
            "listings": rows,
        }
    )


class _Echo:
    def write(self, value):
        return value


def csv_response(filename, header, rows):
    writer = csv.writer(_Echo())

    def stream():
        yield "﻿"  # BOM so Excel opens Bangla/৳ correctly
        yield writer.writerow(header)
        for r in rows:
            yield writer.writerow(r)

    resp = StreamingHttpResponse(stream(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    resp["Cache-Control"] = "no-store"
    return resp


@api_view(["GET"])
def export_sales(request):
    from apps.escrow.models import Order

    qs = Order.objects.filter(seller=request.user).select_related("listing", "buyer").order_by("-created_at")
    rows = (
        (
            o.code, timezone.localtime(o.created_at).strftime("%Y-%m-%d %H:%M"), o.listing.title,
            o.listing.get_category_display(), o.buyer.username, o.amount, o.fee, o.seller_net,
            o.get_status_display(),
            timezone.localtime(o.closed_at).strftime("%Y-%m-%d %H:%M") if o.closed_at else "",
        )
        for o in qs.iterator()
    )
    return csv_response(
        "media-sales.csv",
        ["Order", "Opened", "Listing", "Category", "Buyer", "Price", "Platform fee", "You receive", "Status", "Closed"],
        rows,
    )
