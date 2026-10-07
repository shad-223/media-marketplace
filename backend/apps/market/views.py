from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import notify
from apps.common.crypto import read_private_file, store_private_file
from apps.common.permissions import IsStaff, validate_upload

from .models import CATEGORIES, Listing, Offer, Review, SavedListing
from .seller import record_view
from .serializers import (
    ListingCardSerializer,
    ListingDetailSerializer,
    ListingWriteSerializer,
    OfferSerializer,
    ReviewSerializer,
)

PUBLIC = [Listing.Status.APPROVED, Listing.Status.RESERVED, Listing.Status.SOLD]


def _dec(v):
    try:
        return Decimal(v)
    except (InvalidOperation, TypeError):
        return None


def saved_ids(request):
    if request.user.is_authenticated:
        return set(SavedListing.objects.filter(user=request.user).values_list("listing_id", flat=True))
    return None


@api_view(["GET"])
@permission_classes([AllowAny])
def categories(request):
    counts = {}
    for c in Listing.objects.filter(status=Listing.Status.APPROVED).values_list("category", flat=True):
        counts[c] = counts.get(c, 0) + 1
    return Response([{"value": v, "label": label, "group": g, "count": counts.get(v, 0)} for v, label, g in CATEGORIES])


class MarketplaceList(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ListingCardSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = Listing.objects.select_related("seller")
        qs = qs.filter(status=Listing.Status.SOLD) if p.get("sold") else qs.filter(status=Listing.Status.APPROVED)
        if p.get("category"):
            qs = qs.filter(category__in=p["category"].split(","))
        if p.get("group"):
            from .models import CATEGORY_GROUP

            qs = qs.filter(category__in=[c for c, g in CATEGORY_GROUP.items() if g == p["group"]])
        if p.get("seller"):
            qs = qs.filter(seller__username__iexact=p["seller"])
        if p.get("q"):
            q = p["q"]
            qs = qs.filter(Q(title__icontains=q) | Q(niche__icontains=q) | Q(description__icontains=q))
        if _dec(p.get("min_price")) is not None:
            qs = qs.filter(price__gte=_dec(p["min_price"]))
        if _dec(p.get("max_price")) is not None:
            qs = qs.filter(price__lte=_dec(p["max_price"]))
        if p.get("verified"):
            qs = qs.filter(is_verified=True)
        if p.get("monetized"):
            qs = qs.filter(monetized=True)
        if p.get("min_audience", "").isdigit():
            qs = qs.filter(audience__gte=int(p["min_audience"]))
        order = {
            "price_asc": "price", "price_desc": "-price", "audience": "-audience",
            "revenue": "-monthly_revenue", "newest": "-approved_at",
        }.get(p.get("sort"), "-approved_at")
        return qs.order_by(order, "-id")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "saved_ids": saved_ids(self.request)}


@api_view(["GET"])
@permission_classes([AllowAny])
def listing_detail(request, pk):
    listing = get_object_or_404(Listing.objects.select_related("seller"), pk=pk)
    is_owner = request.user.is_authenticated and (request.user.id == listing.seller_id or request.user.is_staff)
    if listing.status not in PUBLIC and not is_owner:
        return Response({"detail": "Not found."}, status=404)
    if not is_owner and not request.query_params.get("peek"):  # peek = previews (recently viewed) don't count
        Listing.objects.filter(pk=pk).update(views=F("views") + 1)
        record_view(pk)
    data = ListingDetailSerializer(listing, context={"saved_ids": saved_ids(request)}).data
    if not is_owner:
        data.pop("admin_note", None)
        data.pop("verify_code", None)
    data["seller_reviews"] = ReviewSerializer(Review.objects.filter(reviewee=listing.seller)[:5], many=True).data
    if request.user.is_authenticated:
        mine = Offer.objects.filter(listing=listing, buyer=request.user).first()
        data["my_offer"] = OfferSerializer(mine).data if mine else None
    return Response(data)


class MyListings(APIView):
    def get(self, request):
        qs = Listing.objects.filter(seller=request.user).select_related("seller").order_by("-created_at")
        return Response(ListingDetailSerializer(qs, many=True).data)

    def post(self, request):
        s = ListingWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        proof = request.FILES.get("proof")
        validate_upload(proof)
        listing = s.save(seller=request.user, proof_ref=store_private_file(proof, "proofs") if proof else "")
        return Response(ListingDetailSerializer(listing).data, status=status.HTTP_201_CREATED)


class MyListingDetail(APIView):
    def get_obj(self, request, pk):
        listing = get_object_or_404(Listing, pk=pk)
        if listing.seller_id != request.user.id:
            raise PermissionDenied()
        return listing

    def patch(self, request, pk):
        listing = self.get_obj(request, pk)
        if listing.status in (Listing.Status.RESERVED, Listing.Status.SOLD):
            raise ValidationError({"detail": "A listing in escrow or sold can no longer be edited."})
        action = request.data.get("action")
        if action in ("pause", "resume"):
            if action == "pause" and listing.status == Listing.Status.APPROVED:
                listing.status = Listing.Status.PAUSED
            elif action == "resume" and listing.status == Listing.Status.PAUSED:
                listing.status = Listing.Status.APPROVED
            listing.save(update_fields=["status"])
            return Response(ListingDetailSerializer(listing).data)
        s = ListingWriteSerializer(listing, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        proof = request.FILES.get("proof")
        validate_upload(proof)
        extra = {"proof_ref": store_private_file(proof, "proofs")} if proof else {}
        # Any edit to content sends the listing back to admin review.
        listing = s.save(status=Listing.Status.PENDING, is_verified=False, ownership_found=None, ownership_checked_at=None, **extra)
        return Response(ListingDetailSerializer(listing).data)

    def delete(self, request, pk):
        listing = self.get_obj(request, pk)
        if listing.orders.exists():
            raise ValidationError({"detail": "This listing has orders and cannot be deleted. Pause it instead."})
        listing.delete()
        return Response(status=204)


class SavedView(APIView):
    def get(self, request):
        qs = Listing.objects.filter(saved_by__user=request.user).select_related("seller").order_by("-saved_by__created_at")
        return Response(ListingCardSerializer(qs, many=True, context={"saved_ids": saved_ids(request)}).data)

    def post(self, request):
        listing = get_object_or_404(Listing, pk=request.data.get("listing"), status__in=PUBLIC)
        obj, created = SavedListing.objects.get_or_create(user=request.user, listing=listing)
        if not created:
            obj.delete()
        return Response({"saved": created})


class OffersView(APIView):
    """GET ?side=buyer|seller. POST {listing, amount, message} makes a bid."""

    def get(self, request):
        qs = Offer.objects.select_related("listing__seller", "buyer")
        qs = qs.filter(listing__seller=request.user) if request.query_params.get("side") == "seller" else qs.filter(buyer=request.user)
        return Response(OfferSerializer(qs, many=True).data)

    def post(self, request):
        from apps.escrow.services import check_trade_limit

        listing = get_object_or_404(Listing, pk=request.data.get("listing"), status=Listing.Status.APPROVED)
        if not listing.allow_offers:
            raise ValidationError({"detail": "The seller is not accepting offers on this listing."})
        if listing.seller_id == request.user.id:
            raise ValidationError({"detail": "You cannot bid on your own listing."})
        amount = _dec(request.data.get("amount"))
        if amount is None or amount < listing.price * Decimal("0.3") or amount >= listing.price:
            raise ValidationError({"amount": "Offer must be below the asking price and at least 30% of it."})
        check_trade_limit(request.user, amount)
        with transaction.atomic():
            Offer.objects.filter(listing=listing, buyer=request.user, status__in=[Offer.Status.PENDING, Offer.Status.COUNTERED]).update(status=Offer.Status.WITHDRAWN)
            offer = Offer.objects.create(listing=listing, buyer=request.user, amount=amount, message=(request.data.get("message") or "")[:500])
        notify(listing.seller, "New offer received", f"{request.user.username} offered ৳{amount:,.2f} for “{listing.title}”.", "/dashboard/bids?tab=received")
        return Response(OfferSerializer(offer).data, status=201)


@api_view(["POST"])
def offer_action(request, pk):
    offer = get_object_or_404(Offer.objects.select_related("listing"), pk=pk)
    action = request.data.get("action")
    if action in ("accept", "reject"):
        if offer.listing.seller_id != request.user.id:
            raise PermissionDenied()
        if offer.status != Offer.Status.PENDING or offer.listing.status != Listing.Status.APPROVED:
            raise ValidationError({"detail": "This offer can no longer be answered."})
        offer.status = Offer.Status.ACCEPTED if action == "accept" else Offer.Status.REJECTED
        offer.save(update_fields=["status"])
        notify(
            offer.buyer,
            f"Offer {offer.status}",
            f"Your ৳{offer.amount:,.2f} offer on “{offer.listing.title}” was {offer.status}."
            + (" Pay now to open escrow." if action == "accept" else ""),
            f"/listings/{offer.listing_id}",
        )
    elif action == "counter":
        if offer.listing.seller_id != request.user.id:
            raise PermissionDenied()
        if offer.status != Offer.Status.PENDING or offer.listing.status != Listing.Status.APPROVED:
            raise ValidationError({"detail": "Only a pending offer on a live listing can be countered."})
        counter = _dec(request.data.get("counter_amount"))
        if counter is None or counter <= offer.amount or counter > offer.listing.price:
            raise ValidationError({"counter_amount": "Counter must be above the buyer's offer and no more than your asking price."})
        offer.counter_amount, offer.counter_message = counter, (request.data.get("message") or "")[:500]
        offer.status = Offer.Status.COUNTERED
        offer.save(update_fields=["counter_amount", "counter_message", "status"])
        notify(offer.buyer, "Seller sent a counter-offer", f"৳{counter:,.2f} for “{offer.listing.title}” (you offered ৳{offer.amount:,.2f}).", "/dashboard/bids")
    elif action in ("accept_counter", "decline_counter"):
        if offer.buyer_id != request.user.id:
            raise PermissionDenied()
        if offer.status != Offer.Status.COUNTERED or offer.listing.status != Listing.Status.APPROVED:
            raise ValidationError({"detail": "There is no open counter-offer to answer."})
        if action == "accept_counter":
            from apps.escrow.services import check_trade_limit

            check_trade_limit(request.user, offer.counter_amount)
            offer.status = Offer.Status.ACCEPTED
        else:
            offer.status, offer.counter_amount = Offer.Status.REJECTED, None
        offer.save(update_fields=["status", "counter_amount"])
        verb = "accepted" if action == "accept_counter" else "declined"
        notify(offer.listing.seller, f"Counter-offer {verb}", f"@{request.user.username} {verb} your counter on “{offer.listing.title}”.", "/dashboard/bids?tab=received")
    elif action == "withdraw":
        if offer.buyer_id != request.user.id or offer.status not in (Offer.Status.PENDING, Offer.Status.ACCEPTED, Offer.Status.COUNTERED):
            raise ValidationError({"detail": "This offer cannot be withdrawn."})
        offer.status = Offer.Status.WITHDRAWN
        offer.save(update_fields=["status"])
    else:
        raise ValidationError({"action": "accept, reject, counter, accept_counter, decline_counter or withdraw"})
    return Response(OfferSerializer(offer).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def recent_activity(request):
    """Social proof: recently sold assets + latest reviews."""
    sold = Listing.objects.filter(status=Listing.Status.SOLD).select_related("seller").order_by("-updated_at")[:8]
    reviews = Review.objects.select_related("reviewer", "reviewee").order_by("-created_at")[:6]
    return Response(
        {
            "sold": ListingCardSerializer(sold, many=True).data,
            "reviews": [
                {**ReviewSerializer(r).data, "reviewee": r.reviewee.username} for r in reviews
            ],
        }
    )


# --- Admin --------------------------------------------------------------


class AdminListings(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = ListingDetailSerializer

    def get_queryset(self):
        st = self.request.query_params.get("status", "pending")
        qs = Listing.objects.select_related("seller").order_by("created_at" if st == "pending" else "-created_at")
        return qs if st == "all" else qs.filter(status=st)


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_listing_decide(request, pk):
    listing = get_object_or_404(Listing, pk=pk)
    decision = request.data.get("decision")
    note = (request.data.get("note") or "")[:300]
    if decision == "approve":
        if listing.status not in (Listing.Status.PENDING, Listing.Status.REJECTED, Listing.Status.PAUSED):
            raise ValidationError({"detail": "Only pending listings can be approved."})
        listing.status, listing.approved_at = Listing.Status.APPROVED, timezone.now()
        listing.is_verified = bool(request.data.get("verified"))
        notify(listing.seller, "Listing approved ✓", f"“{listing.title}” is now live on the marketplace.", f"/listings/{listing.pk}")
        from apps.inbox.alerts import schedule_alerts

        schedule_alerts(listing)
    elif decision == "reject":
        if listing.status in (Listing.Status.RESERVED, Listing.Status.SOLD):
            raise ValidationError({"detail": "Listing is in escrow or sold."})
        if not note:
            raise ValidationError({"note": "Tell the seller why."})
        listing.status = Listing.Status.REJECTED
        notify(listing.seller, "Listing rejected", f"“{listing.title}”: {note}", "/dashboard/listings")
    else:
        raise ValidationError({"decision": "approve or reject"})
    listing.admin_note = note
    listing.save()
    return Response(ListingDetailSerializer(listing).data)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_listing_proof(request, pk):
    listing = get_object_or_404(Listing, pk=pk)
    if not listing.proof_ref:
        return Response(status=404)
    data, name, ctype = read_private_file(listing.proof_ref)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'inline; filename="{name}"'
    resp["Cache-Control"] = "no-store"
    return resp


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_check_ownership(request, pk):
    """Fetch the listing's public URL and look for its verify_code."""
    from .ownership import OwnershipCheckError, code_present

    listing = get_object_or_404(Listing, pk=pk)
    if not listing.asset_url:
        raise ValidationError({"detail": "This listing has no public URL to check."})
    try:
        found = code_present(listing.asset_url, listing.verify_code)
    except OwnershipCheckError as e:
        return Response({"found": None, "error": str(e), "verify_code": listing.verify_code}, status=200)
    listing.ownership_found, listing.ownership_checked_at = found, timezone.now()
    listing.save(update_fields=["ownership_found", "ownership_checked_at"])
    return Response(
        {"found": found, "error": "", "verify_code": listing.verify_code, "checked_at": listing.ownership_checked_at}
    )
