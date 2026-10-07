import csv
import secrets
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.accounts.models import Notification, User, notify
from apps.accounts.serializers import MeSerializer
from apps.common.permissions import IsStaff
from apps.escrow.models import Order
from apps.market.models import Listing
from apps.wallet import ledger
from apps.wallet.models import Account, Deposit, Entry, JournalTransaction, Withdrawal

from .audit import log_admin
from .models import AdminAction, DeletionRequest, Report, Ticket, TicketMessage

K = Account.Kind


def _staff_users():
    return User.objects.filter(is_staff=True, is_active=True)


def _note(request, required=False, field="note", label="note"):
    v = (request.data.get(field) or "").strip()
    if required and not v:
        raise ValidationError({field: f"A {label} is required."})
    return v


# --- Audit log -----------------------------------------------------------


class AdminActionSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = AdminAction
        fields = ["id", "actor", "action", "target_type", "target_id", "summary", "data", "ip", "created_at"]

    def get_actor(self, a):
        return a.actor.username if a.actor else "—"


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_audit(request):
    qs = AdminAction.objects.select_related("actor")
    p = request.query_params
    if p.get("action"):
        qs = qs.filter(action=p["action"])
    if p.get("actor"):
        qs = qs.filter(actor__username__iexact=p["actor"])
    if p.get("target_type"):
        qs = qs.filter(target_type=p["target_type"])
    if p.get("q"):
        qs = qs.filter(summary__icontains=p["q"])
    actions = sorted(set(AdminAction.objects.values_list("action", flat=True)))
    return Response({"results": AdminActionSerializer(qs[:300], many=True).data, "actions": actions})


# --- Admin user tools ----------------------------------------------------


@api_view(["POST"])
def admin_user_adjust(request, pk):
    """Credit (+) or debit (−) a user's available balance. Superusers only; always audited."""
    if not request.user.is_superuser:
        raise PermissionDenied("Only a superuser can adjust balances.")
    user = get_object_or_404(User, pk=pk)
    try:
        amount = Decimal(str(request.data.get("amount"))).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        raise ValidationError({"amount": "Enter an amount, e.g. 500 or -250."})
    if amount == 0 or abs(amount) > Decimal("10000000"):
        raise ValidationError({"amount": "Amount must be non-zero and below ৳1 crore."})
    reason = _note(request, True, "reason", "reason")
    avail = ledger.account(user, K.AVAILABLE)
    ledger.post(
        JournalTransaction.Kind.ADJUSTMENT,
        f"Admin adjustment: {reason}",
        [(avail, amount), (ledger.system(K.PLATFORM_ADJUSTMENTS), -amount)],
        created_by=request.user,
        guard=[avail],
    )
    notify(user, "Balance adjusted", f"{'+' if amount > 0 else '−'}৳{abs(amount):,.2f} — {reason}", "/dashboard/transactions")
    log_admin(request, "wallet.adjust", user, f"Adjusted @{user.username} by {amount} ({reason})", amount=amount)
    return Response({"available": str(ledger.balance(user, K.AVAILABLE))})


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_user_revoke_kyc(request, pk):
    user = get_object_or_404(User, pk=pk)
    if user.kyc_status != User.Kyc.VERIFIED:
        raise ValidationError({"detail": "This user is not verified."})
    reason = _note(request, True, "reason", "reason")
    user.kyc_status = User.Kyc.NONE
    user.save(update_fields=["kyc_status"])
    notify(user, "Verification revoked", f"{reason} — please submit your identity documents again.", "/dashboard/kyc")
    log_admin(request, "kyc.revoke", user, f"Revoked KYC of @{user.username}: {reason}")
    return Response(MeSerializer(user).data)


@api_view(["POST"])
def admin_user_temp_password(request, pk):
    """Sets a random temporary password and returns it once. Superusers only."""
    if not request.user.is_superuser:
        raise PermissionDenied("Only a superuser can reset passwords.")
    user = get_object_or_404(User, pk=pk)
    if user == request.user or user.is_superuser:
        raise ValidationError({"detail": "Use your own settings page to change this password."})
    temp = "Tmp-" + secrets.token_urlsafe(9)
    user.set_password(temp)
    user.save(update_fields=["password"])
    notify(user, "Your password was reset", "Support set a temporary password. Log in and change it under Settings.", "/dashboard/settings")
    log_admin(request, "user.temp_password", user, f"Set temporary password for @{user.username}")
    return Response({"temporary_password": temp})


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_user_listings(request, pk):
    user = get_object_or_404(User, pk=pk)
    return Response(
        [
            {"id": l.id, "title": l.title, "category": l.category, "price": str(l.price), "status": l.status, "status_label": l.get_status_display()}
            for l in user.listings.order_by("-created_at")[:50]
        ]
    )


# --- Reports -------------------------------------------------------------


class ReportSerializer(serializers.ModelSerializer):
    reporter = serializers.CharField(source="reporter.username", read_only=True)
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    listing_title = serializers.SerializerMethodField()
    listing_status = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    user_active = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            "id", "reporter", "listing", "listing_title", "listing_status", "user", "user_name", "user_active",
            "reason", "reason_label", "details", "status", "admin_note", "created_at", "handled_at",
        ]

    def get_listing_title(self, r):
        return r.listing.title if r.listing_id else None

    def get_listing_status(self, r):
        return r.listing.status if r.listing_id else None

    def get_user_name(self, r):
        return r.user.username if r.user_id else None

    def get_user_active(self, r):
        return r.user.is_active if r.user_id else None


class ReportThrottle(UserRateThrottle):
    rate = "10/hour"


@api_view(["POST"])
@throttle_classes([ReportThrottle])
def create_report(request):
    d = request.data
    reason = d.get("reason")
    if reason not in Report.Reason.values:
        raise ValidationError({"reason": "Choose a reason."})
    listing = user = None
    if d.get("listing"):
        listing = get_object_or_404(Listing, pk=d["listing"])
        if listing.seller_id == request.user.id:
            raise ValidationError({"detail": "You cannot report your own listing."})
    elif d.get("user"):
        user = get_object_or_404(User, username__iexact=str(d["user"]))
        if user.id == request.user.id:
            raise ValidationError({"detail": "You cannot report yourself."})
    else:
        raise ValidationError({"detail": "Report a listing or a user."})
    dup = Report.objects.filter(reporter=request.user, status=Report.Status.OPEN, listing=listing, user=user).exists()
    if dup:
        raise ValidationError({"detail": "You already reported this — our team is reviewing it."})
    r = Report.objects.create(reporter=request.user, listing=listing, user=user, reason=reason, details=(d.get("details") or "")[:2000])
    for admin in _staff_users():
        notify(admin, "New report", f"{r.get_reason_display()}: {listing.title if listing else '@' + user.username}", "/admin/reports")
    return Response({"id": r.id, "status": r.status}, status=201)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_reports(request):
    st = request.query_params.get("status", "open")
    qs = Report.objects.select_related("reporter", "listing", "user")
    if st != "all":
        qs = qs.filter(status=st)
    return Response(ReportSerializer(qs[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_report_decide(request, pk):
    r = get_object_or_404(Report, pk=pk, status=Report.Status.OPEN)
    decision = request.data.get("decision")
    if decision not in (Report.Status.RESOLVED, Report.Status.DISMISSED):
        raise ValidationError({"decision": "resolved or dismissed"})
    note = _note(request)
    with transaction.atomic():
        if request.data.get("pause_listing") and r.listing_id:
            Listing.objects.filter(pk=r.listing_id, status=Listing.Status.APPROVED).update(status=Listing.Status.PAUSED)
            notify(r.listing.seller, "Listing paused by Media", note or "Paused after a report. Contact support.", "/dashboard/listings")
        if request.data.get("suspend_user") and r.user_id and not r.user.is_superuser:
            User.objects.filter(pk=r.user_id).update(is_active=False)
        r.status, r.admin_note, r.handled_by, r.handled_at = decision, note[:500], request.user, timezone.now()
        r.save()
    notify(r.reporter, "Thanks for your report", "Our team reviewed it and took action." if decision == "resolved" else "Our team reviewed it — no action needed this time.", "")
    log_admin(request, f"report.{decision}", r, f"Report #{r.id} {decision}" + (" + paused listing" if request.data.get("pause_listing") else "") + (" + suspended user" if request.data.get("suspend_user") else ""))
    return Response(ReportSerializer(r).data)


# --- Featured listings ---------------------------------------------------


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_listing_feature(request, pk):
    listing = get_object_or_404(Listing, pk=pk)
    featured = bool(request.data.get("featured", not getattr(listing, "is_featured", False)))
    if featured and listing.status != Listing.Status.APPROVED:
        raise ValidationError({"detail": "Only live listings can be featured."})
    if not any(f.name == "is_featured" for f in Listing._meta.get_fields()):
        return Response({"detail": "feature field missing"}, status=400)
    Listing.objects.filter(pk=pk).update(is_featured=featured)
    if featured:
        notify(listing.seller, "Your listing is featured ⭐", f"“{listing.title}” now appears in Featured on the homepage.", f"/listings/{listing.pk}")
    log_admin(request, "listing.feature" if featured else "listing.unfeature", listing, f"{'Featured' if featured else 'Unfeatured'} “{listing.title}”")
    return Response({"id": listing.pk, "is_featured": featured})


# --- Broadcast -----------------------------------------------------------


def _audience(name):
    qs = User.objects.filter(is_active=True)
    if name == "verified":
        return qs.filter(kyc_status=User.Kyc.VERIFIED)
    if name == "sellers":
        return qs.filter(listings__isnull=False).distinct()
    if name == "buyers":
        return qs.filter(purchases__isnull=False).distinct()
    return qs


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_broadcast(request):
    title = (request.data.get("title") or "").strip()[:140]
    body = (request.data.get("body") or "").strip()[:500]
    link = (request.data.get("link") or "").strip()[:200]
    audience = request.data.get("audience", "all")
    if audience not in ("all", "verified", "sellers", "buyers"):
        raise ValidationError({"audience": "all, verified, sellers or buyers"})
    if not title:
        raise ValidationError({"title": "Add a title."})
    if link and not link.startswith("/"):
        raise ValidationError({"link": "Use a site path like /marketplace."})
    ids = list(_audience(audience).values_list("id", flat=True))
    if request.data.get("dry_run"):
        return Response({"recipients": len(ids)})
    Notification.objects.bulk_create([Notification(user_id=i, title=title, body=body, link=link) for i in ids], batch_size=500)
    log_admin(request, "broadcast", None, f"Broadcast to {audience} ({len(ids)}): {title}", audience=audience, recipients=len(ids))
    return Response({"recipients": len(ids)})


# --- CSV exports ---------------------------------------------------------


class _Echo:
    def write(self, value):
        return value


def _csv_response(name, header, rows):
    writer = csv.writer(_Echo())

    def gen():
        yield "﻿"  # UTF-8 BOM so Excel shows ৳ and Bangla correctly
        yield writer.writerow(header)
        for row in rows:
            yield writer.writerow(row)

    resp = StreamingHttpResponse(gen(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="media-{name}-{timezone.localdate():%Y%m%d}.csv"'
    resp["Cache-Control"] = "no-store"
    return resp


def _iso(dt):
    return timezone.localtime(dt).strftime("%Y-%m-%d %H:%M") if dt else ""


EXPORTS = {
    "users": (
        ["id", "email", "username", "phone", "kyc", "email_verified", "staff", "active", "joined"],
        lambda: (
            [u.id, u.email, u.username, u.phone, u.kyc_status, u.email_verified, u.is_staff, u.is_active, _iso(u.date_joined)]
            for u in User.objects.order_by("id").iterator()
        ),
    ),
    "orders": (
        ["code", "listing", "category", "buyer", "seller", "amount", "fee", "seller_net", "status", "created", "closed"],
        lambda: (
            [o.code, o.listing.title, o.listing.category, o.buyer.username, o.seller.username, o.amount, o.fee, o.seller_net, o.status, _iso(o.created_at), _iso(o.closed_at)]
            for o in Order.objects.select_related("listing", "buyer", "seller").order_by("id").iterator()
        ),
    ),
    "ledger": (
        ["txn_id", "date", "kind", "memo", "account_owner", "account", "amount", "order"],
        lambda: (
            [e.transaction_id, _iso(e.transaction.created_at), e.transaction.kind, e.transaction.memo, e.account.user.username if e.account.user_id else "SYSTEM", e.account.kind, e.amount, e.transaction.order_id or ""]
            for e in Entry.objects.select_related("transaction", "account__user").order_by("transaction_id", "id").iterator()
        ),
    ),
    "withdrawals": (
        ["id", "user", "method", "account_number", "account_name", "bank", "amount", "status", "payout_ref", "note", "created", "reviewed"],
        lambda: (
            [w.id, w.user.username, w.method, w.account_number, w.account_name, w.bank_name, w.amount, w.status, w.payout_reference, w.note, _iso(w.created_at), _iso(w.reviewed_at)]
            for w in Withdrawal.objects.select_related("user").order_by("id").iterator()
        ),
    ),
    "deposits": (
        ["id", "user", "method", "amount", "reference", "sender", "gateway", "gateway_ref", "status", "note", "created", "reviewed"],
        lambda: (
            [d.id, d.user.username, d.method, d.amount, d.reference, d.sender, getattr(d, "gateway", ""), getattr(d, "gateway_ref", ""), d.status, d.note, _iso(d.created_at), _iso(d.reviewed_at)]
            for d in Deposit.objects.select_related("user").order_by("id").iterator()
        ),
    ),
}


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_export(request, kind):
    if kind not in EXPORTS:
        return Response({"detail": "Unknown export."}, status=404)
    header, rows = EXPORTS[kind]
    log_admin(request, "export", None, f"Exported {kind} CSV", kind=kind)
    return _csv_response(kind, header, rows())


# --- Support tickets -----------------------------------------------------


class TicketMessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = ["id", "sender", "is_staff_reply", "body", "created_at"]

    def get_sender(self, m):
        if m.is_staff_reply:
            return "Media support"
        return m.sender.username if m.sender else "—"


class TicketSerializer(serializers.ModelSerializer):
    code = serializers.CharField(read_only=True)
    user = serializers.CharField(source="user.username", read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    order_code = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = ["id", "code", "user", "subject", "category", "category_label", "order", "order_code", "status", "status_label", "created_at", "updated_at"]

    def get_order_code(self, t):
        return t.order.code if t.order_id else None


def _ticket_for(user, pk):
    t = get_object_or_404(Ticket.objects.select_related("user", "order"), pk=pk)
    if not (user.is_staff or t.user_id == user.id):
        raise PermissionDenied()
    return t


@api_view(["GET", "POST"])
def tickets(request):
    if request.method == "GET":
        return Response(TicketSerializer(Ticket.objects.filter(user=request.user).select_related("user", "order")[:100], many=True).data)
    subject = (request.data.get("subject") or "").strip()[:140]
    body = (request.data.get("body") or "").strip()[:4000]
    category = request.data.get("category") or Ticket.Category.OTHER
    if not subject or not body:
        raise ValidationError({"detail": "Subject and message are required."})
    if category not in Ticket.Category.values:
        raise ValidationError({"category": "Unknown category."})
    order = None
    if request.data.get("order"):
        order = Order.objects.filter(Q(buyer=request.user) | Q(seller=request.user), pk=request.data["order"]).first()
        if not order:
            raise ValidationError({"order": "That order isn't yours."})
    if Ticket.objects.filter(user=request.user, status=Ticket.Status.OPEN).count() >= 10:
        raise ValidationError({"detail": "You have too many open tickets. Please wait for replies."})
    with transaction.atomic():
        t = Ticket.objects.create(user=request.user, subject=subject, category=category, order=order)
        TicketMessage.objects.create(ticket=t, sender=request.user, body=body)
    for admin in _staff_users():
        notify(admin, f"New support ticket {t.code}", subject, f"/admin/support?ticket={t.pk}")
    return Response(TicketSerializer(t).data, status=201)


def _ticket_payload(t):
    return {**TicketSerializer(t).data, "messages": TicketMessageSerializer(t.messages.select_related("sender"), many=True).data}


@api_view(["GET"])
def ticket_detail(request, pk):
    return Response(_ticket_payload(_ticket_for(request.user, pk)))


@api_view(["POST"])
def ticket_reply(request, pk):
    t = _ticket_for(request.user, pk)
    body = (request.data.get("body") or "").strip()[:4000]
    if not body:
        raise ValidationError({"body": "Write a message."})
    staff_reply = request.user.is_staff and t.user_id != request.user.id
    if t.status == Ticket.Status.CLOSED and not staff_reply:
        raise ValidationError({"detail": "This ticket is closed. Open a new one."})
    TicketMessage.objects.create(ticket=t, sender=request.user, body=body, is_staff_reply=staff_reply)
    t.status = Ticket.Status.ANSWERED if staff_reply else Ticket.Status.OPEN
    t.save(update_fields=["status", "updated_at"])
    if staff_reply:
        notify(t.user, f"Support replied ({t.code})", body[:120], f"/dashboard/support?ticket={t.pk}")
        log_admin(request, "ticket.reply", t, f"Replied to {t.code}")
    else:
        for admin in _staff_users():
            notify(admin, f"Ticket {t.code} updated", body[:120], f"/admin/support?ticket={t.pk}")
    return Response(_ticket_payload(t))


@api_view(["POST"])
def ticket_close(request, pk):
    t = _ticket_for(request.user, pk)
    t.status = Ticket.Status.CLOSED
    t.save(update_fields=["status", "updated_at"])
    if request.user.is_staff and t.user_id != request.user.id:
        log_admin(request, "ticket.close", t, f"Closed {t.code}")
    return Response(TicketSerializer(t).data)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_tickets(request):
    st = request.query_params.get("status", "open")
    qs = Ticket.objects.select_related("user", "order")
    if st != "all":
        qs = qs.filter(status=st)
    return Response(TicketSerializer(qs[:200], many=True).data)


# --- Account deletion ----------------------------------------------------


def deletion_blockers(user):
    """Reasons an account can't be deleted yet (money or trades still in flight)."""
    out = []
    for kind, label in ((K.AVAILABLE, "available balance"), (K.ESCROW, "money in escrow"), (K.WITHDRAW_HOLD, "withdrawal in progress")):
        if ledger.balance(user, kind) != 0:
            out.append(f"You still have {label}.")
    if Order.objects.filter(Q(buyer=user) | Q(seller=user), status__in=Order.OPEN).exists():
        out.append("You have open orders in escrow.")
    if Withdrawal.objects.filter(user=user, status=Withdrawal.Status.PENDING).exists():
        out.append("You have a pending withdrawal.")
    return out


class DeletionRequestSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    blockers = serializers.SerializerMethodField()

    class Meta:
        model = DeletionRequest
        fields = ["id", "user", "email", "original_email", "reason", "status", "status_label", "admin_note", "blockers", "created_at", "handled_at"]

    def get_blockers(self, r):
        return deletion_blockers(r.user) if r.status == DeletionRequest.Status.PENDING else []


@api_view(["GET", "POST", "DELETE"])
def my_deletion_request(request):
    user = request.user
    pending = user.deletion_requests.filter(status=DeletionRequest.Status.PENDING).first()
    if request.method == "GET":
        return Response({"request": DeletionRequestSerializer(pending).data if pending else None, "blockers": deletion_blockers(user)})
    if request.method == "DELETE":
        if pending:
            pending.status = DeletionRequest.Status.CANCELLED
            pending.save(update_fields=["status"])
        return Response({"request": None})
    if pending:
        raise ValidationError({"detail": "You already requested deletion."})
    if not user.check_password(request.data.get("password") or ""):
        raise ValidationError({"password": "Password is incorrect."})
    blockers = deletion_blockers(user)
    if blockers:
        raise ValidationError({"detail": " ".join(blockers) + " Withdraw your money and finish open trades first."})
    r = DeletionRequest.objects.create(user=user, reason=(request.data.get("reason") or "")[:500], original_email=user.email)
    for admin in _staff_users():
        notify(admin, "Account deletion requested", f"@{user.username}", "/admin/support?tab=deletions")
    return Response({"request": DeletionRequestSerializer(r).data}, status=201)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_deletions(request):
    st = request.query_params.get("status", "pending")
    qs = DeletionRequest.objects.select_related("user")
    if st != "all":
        qs = qs.filter(status=st)
    return Response(DeletionRequestSerializer(qs[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_deletion_decide(request, pk):
    r = get_object_or_404(DeletionRequest.objects.select_related("user"), pk=pk, status=DeletionRequest.Status.PENDING)
    user = r.user
    note = _note(request)
    if request.data.get("decision") == "approve":
        blockers = deletion_blockers(user)
        if blockers:
            raise ValidationError({"detail": "Cannot delete yet: " + " ".join(blockers)})
        if user.is_superuser or user == request.user:
            raise ValidationError({"detail": "This account cannot be deleted here."})
        with transaction.atomic():
            # Anonymise but keep the row: orders, reviews and the ledger must stay intact for the records.
            user.email = f"deleted-{user.pk}@deleted.invalid"
            user.username = f"deleted_{user.pk}"
            user.phone, user.bio, user.first_name, user.last_name = "", "", "", ""
            user.is_active, user.is_staff = False, False
            if getattr(user, "avatar", None):
                user.avatar.delete(save=False)
            user.set_unusable_password()
            user.save()
            Listing.objects.filter(seller=user, status__in=[Listing.Status.APPROVED, Listing.Status.PENDING]).update(status=Listing.Status.PAUSED)
            r.status = DeletionRequest.Status.APPROVED
            r.handled_by, r.handled_at, r.admin_note = request.user, timezone.now(), note[:500]
            r.save()
        log_admin(request, "user.delete", user, f"Deleted account #{user.pk} ({r.original_email})")
    else:
        if not note:
            raise ValidationError({"note": "Tell the user why."})
        r.status, r.admin_note, r.handled_by, r.handled_at = DeletionRequest.Status.REJECTED, note[:500], request.user, timezone.now()
        r.save()
        notify(user, "Account deletion request declined", note, "/dashboard/support")
        log_admin(request, "user.delete_rejected", user, f"Declined deletion of @{user.username}: {note}")
    return Response(DeletionRequestSerializer(r).data)
