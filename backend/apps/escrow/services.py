"""Escrow state machine. Every transition is atomic and posts to the ledger."""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import notify
from apps.common.models import get_site_settings
from apps.market.models import Listing, Offer
from apps.wallet import ledger
from apps.wallet.models import Account, JournalTransaction

from .models import Dispute, Message, Order

S = Order.Status
K = Account.Kind
J = JournalTransaction.Kind


def system_message(order, text):
    Message.objects.create(order=order, sender=None, body=text)


def _fee(amount):
    return (amount * get_site_settings().platform_fee_percent / Decimal(100)).quantize(Decimal("0.01"), ROUND_HALF_UP)


def check_trade_limit(user, amount):
    limit = get_site_settings().unverified_trade_limit
    if not user.is_verified and amount > limit:
        raise ValidationError(
            {"detail": f"Unverified accounts can trade up to ৳{limit:,.0f}. Verify your identity (KYC) to remove this limit."}
        )


def open_order(buyer, listing_id, offer_id=None):
    """Buyer pays into escrow: buyer AVAILABLE -> buyer ESCROW. Listing becomes RESERVED."""
    with transaction.atomic():
        listing = Listing.objects.select_for_update().get(pk=listing_id)
        offer = None
        if offer_id:
            offer = Offer.objects.select_for_update().filter(pk=offer_id, listing=listing, buyer=buyer).first()
            if not offer or offer.status != Offer.Status.ACCEPTED:
                raise ValidationError({"detail": "This offer is not accepted (or no longer valid)."})
        if listing.status != Listing.Status.APPROVED:
            raise ValidationError({"detail": "This listing is not available for purchase."})
        if listing.seller_id == buyer.id:
            raise ValidationError({"detail": "You cannot buy your own listing."})
        amount = offer.agreed_amount if offer else listing.price
        check_trade_limit(buyer, amount)
        order = Order.objects.create(
            listing=listing, offer=offer, buyer=buyer, seller=listing.seller, amount=amount, fee=_fee(amount)
        )
        avail = ledger.account(buyer, K.AVAILABLE)
        ledger.post(
            J.ESCROW_LOCK,
            f"{order.code} payment into escrow — {listing.title}",
            [(avail, -amount), (ledger.account(buyer, K.ESCROW), amount)],
            order=order,
            created_by=buyer,
            guard=[avail],
        )
        listing.status = Listing.Status.RESERVED
        listing.save(update_fields=["status"])
        if offer:
            offer.status = Offer.Status.PAID
            offer.save(update_fields=["status"])
        listing.offers.filter(status=Offer.Status.PENDING).update(status=Offer.Status.REJECTED)
        system_message(
            order,
            f"Escrow opened. ৳{amount:,.2f} is locked safely by Media. Seller: transfer ownership of "
            f"“{listing.title}” and share access details here, then press “Mark as transferred”.",
        )
    notify(listing.seller, "New sale in escrow 🎉", f"{buyer.username} paid ৳{amount:,.2f} for “{listing.title}”.", f"/dashboard/orders/{order.pk}")
    return order


def mark_transferred(order, user):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if user.id != order.seller_id or order.status != S.IN_ESCROW:
            raise ValidationError({"detail": "Only the seller can mark an order transferred while it is in escrow."})
        order.status, order.transferred_at = S.TRANSFERRED, timezone.now()
        order.save(update_fields=["status", "transferred_at"])
        system_message(order, "Seller marked the asset as transferred. Buyer: verify full ownership, then confirm the handover.")
    notify(order.buyer, "Asset transferred", f"Verify ownership of {order.listing.title} and confirm.", f"/dashboard/orders/{order.pk}")
    return order


def confirm_handover(order, user):
    """Buyer confirms (OTP checked by caller). Starts the buyer-protection window."""
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if user.id != order.buyer_id or order.status != S.TRANSFERRED:
            raise ValidationError({"detail": "Only the buyer can confirm, after the seller marks the transfer."})
        now = timezone.now()
        hours = get_site_settings().buyer_protection_hours
        order.status, order.confirmed_at = S.PROTECTION, now
        order.release_at = now + timedelta(hours=hours)
        order.save(update_fields=["status", "confirmed_at", "release_at"])
        system_message(
            order,
            f"Buyer confirmed the handover. Funds release to the seller automatically after the "
            f"{hours}-hour buyer-protection window, unless a dispute is opened.",
        )
    notify(order.seller, "Buyer confirmed handover", f"Funds release after the {hours}h protection window.", f"/dashboard/orders/{order.pk}")
    return order


def release(order, by=None, reason="Buyer-protection window ended"):
    """buyer ESCROW -> seller AVAILABLE (net) + platform revenue (fee)."""
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status not in Order.OPEN:
            raise ValidationError({"detail": "Order is already closed."})
        ledger.post(
            J.ESCROW_RELEASE,
            f"{order.code} released — {order.listing.title}",
            [
                (ledger.account(order.buyer, K.ESCROW), -order.amount),
                (ledger.account(order.seller, K.AVAILABLE), order.seller_net),
                (ledger.system(K.PLATFORM_REVENUE), order.fee),
            ],
            order=order,
            created_by=by,
        )
        order.status, order.closed_at = S.COMPLETED, timezone.now()
        order.save(update_fields=["status", "closed_at"])
        Listing.objects.filter(pk=order.listing_id).update(status=Listing.Status.SOLD)
        system_message(order, f"Escrow released ({reason}). ৳{order.seller_net:,.2f} credited to the seller after the ৳{order.fee:,.2f} platform fee. Trade complete — please leave a review.")
    notify(order.seller, "Funds released 💰", f"৳{order.seller_net:,.2f} is now in your available balance.", f"/dashboard/orders/{order.pk}")
    notify(order.buyer, "Trade completed", "Please leave a review for the seller.", f"/dashboard/orders/{order.pk}")
    return order


def refund(order, by, reason):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status not in Order.OPEN:
            raise ValidationError({"detail": "Order is already closed."})
        ledger.post(
            J.ESCROW_REFUND,
            f"{order.code} refunded — {order.listing.title}",
            [(ledger.account(order.buyer, K.ESCROW), -order.amount), (ledger.account(order.buyer, K.AVAILABLE), order.amount)],
            order=order,
            created_by=by,
        )
        order.status, order.closed_at = S.REFUNDED, timezone.now()
        order.save(update_fields=["status", "closed_at"])
        Listing.objects.filter(pk=order.listing_id).update(status=Listing.Status.APPROVED)
        system_message(order, f"Escrow refunded to the buyer ({reason}). The listing is back on the marketplace.")
    for u in (order.buyer, order.seller):
        notify(u, f"Order {order.code} refunded", reason, f"/dashboard/orders/{order.pk}")
    return order


def open_dispute(order, user, reason):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if user.id not in (order.buyer_id, order.seller_id):
            raise ValidationError({"detail": "Not your order."})
        if order.status not in (S.IN_ESCROW, S.TRANSFERRED, S.PROTECTION):
            raise ValidationError({"detail": "A dispute can only be opened on an active order."})
        if not reason or len(reason.strip()) < 10:
            raise ValidationError({"reason": "Describe the problem (at least 10 characters)."})
        d = Dispute.objects.create(order=order, opened_by=user, reason=reason.strip())
        order.status_before_dispute, order.status = order.status, S.DISPUTED
        order.save(update_fields=["status", "status_before_dispute"])
        system_message(order, f"⚠ Dispute opened by {user.username}: {d.reason}\nFunds are frozen until an escrow agent decides.")
    other = order.seller if user.id == order.buyer_id else order.buyer
    notify(other, "Dispute opened", f"A dispute was opened on {order.code}.", f"/dashboard/orders/{order.pk}")
    return d


def resolve_dispute(dispute, admin, decision, note):
    if decision not in Dispute.Resolution.values:
        raise ValidationError({"decision": "Choose release or refund."})
    if not note:
        raise ValidationError({"note": "Explain the decision to both parties."})
    with transaction.atomic():
        dispute = Dispute.objects.select_for_update().get(pk=dispute.pk)
        if dispute.status != Dispute.Status.OPEN:
            raise ValidationError({"detail": "Dispute already resolved."})
        if decision == Dispute.Resolution.RELEASE:
            release(dispute.order, by=admin, reason=f"dispute resolved by escrow agent: {note}")
        else:
            refund(dispute.order, by=admin, reason=f"dispute resolved by escrow agent: {note}")
        dispute.status, dispute.resolution, dispute.admin_note = Dispute.Status.RESOLVED, decision, note[:500]
        dispute.resolved_by, dispute.resolved_at = admin, timezone.now()
        dispute.save()
    return dispute


def release_due_orders():
    """Release every order whose protection window has ended. Safe to call often (cron + lazily)."""
    released = 0
    for order in Order.objects.filter(status=S.PROTECTION, release_at__lte=timezone.now()):
        try:
            release(order)
            released += 1
        except ValidationError:
            pass
    return released


def request_cancel(order, user, reason):
    from .models import CancelRequest

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if user.id not in (order.buyer_id, order.seller_id):
            raise ValidationError({"detail": "Not your order."})
        if order.status != S.IN_ESCROW:
            raise ValidationError({"detail": "Cancellation can only be requested before the seller marks the transfer."})
        reason = (reason or "").strip()
        if len(reason) < 5:
            raise ValidationError({"reason": "Give a short reason."})
        if order.cancel_requests.filter(status=CancelRequest.Status.PENDING).exists():
            raise ValidationError({"detail": "A cancellation request is already waiting for an answer."})
        cr = CancelRequest.objects.create(order=order, requested_by=user, reason=reason[:500])
        system_message(order, f"@{user.username} asked to cancel this order: {cr.reason}\nThe other party can accept (full refund to the buyer) or decline.")
    other = order.seller if user.id == order.buyer_id else order.buyer
    notify(other, "Cancellation requested", f"@{user.username} wants to cancel {order.code}.", f"/dashboard/orders/{order.pk}")
    return cr


def answer_cancel(order, user, accept):
    from .models import CancelRequest

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        cr = order.cancel_requests.select_for_update().filter(status=CancelRequest.Status.PENDING).first()
        if not cr:
            raise ValidationError({"detail": "There is no pending cancellation request."})
        if user.id not in (order.buyer_id, order.seller_id) or user.id == cr.requested_by_id:
            raise ValidationError({"detail": "Only the other party can answer this request."})
        if accept and order.status != S.IN_ESCROW:
            raise ValidationError({"detail": "The order has moved on and can no longer be cancelled this way."})
        cr.status = CancelRequest.Status.ACCEPTED if accept else CancelRequest.Status.DECLINED
        cr.responded_at = timezone.now()
        cr.save(update_fields=["status", "responded_at"])
        if accept:
            refund(order, by=user, reason=f"cancelled by mutual agreement: {cr.reason}")
        else:
            system_message(order, f"@{user.username} declined the cancellation request. The trade continues.")
    if not accept:
        notify(cr.requested_by, "Cancellation declined", f"{order.code} continues.", f"/dashboard/orders/{order.pk}")
    return cr


def withdraw_cancel(order, user):
    from .models import CancelRequest

    n = order.cancel_requests.filter(status=CancelRequest.Status.PENDING, requested_by=user).update(
        status=CancelRequest.Status.WITHDRAWN, responded_at=timezone.now()
    )
    if not n:
        raise ValidationError({"detail": "You have no pending cancellation request."})
    system_message(order, f"@{user.username} withdrew the cancellation request.")
