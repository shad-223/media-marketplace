import os
import uuid

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.crypto import encrypt_text, read_private_file, store_private_file
from apps.common.messaging import mask_email, send_code
from apps.common.permissions import IsStaff, validate_upload
from apps.support.audit import log_admin

from .models import KycSubmission, Notification, OneTimeCode, User, notify
from .serializers import (
    AdminKycSerializer,
    KycSubmissionSerializer,
    MeSerializer,
    NotificationSerializer,
    PublicUserSerializer,
    RegisterSerializer,
)


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class AuthThrottle(ScopedRateThrottle):
    scope_attr = "throttle_scope"


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    s = RegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = s.save()
    notify(user, "Welcome to Media", "Verify your identity to unlock higher trade limits.", "/dashboard/kyc")
    return Response({"user": MeSerializer(user).data, **tokens_for(user)}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        ident = (request.data.get("email") or "").strip()
        password = request.data.get("password") or ""
        user = User.objects.filter(email__iexact=ident).first() or User.objects.filter(username__iexact=ident).first()
        if not user or not user.check_password(password) or not user.is_active:
            return Response({"detail": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        return Response({"user": MeSerializer(user).data, **tokens_for(user)})


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user


@api_view(["GET"])
@permission_classes([AllowAny])
def public_profile(request, username):
    from apps.market.models import Review

    user = get_object_or_404(User, username__iexact=username, is_active=True)
    reviews = Review.objects.filter(reviewee=user).select_related("reviewer", "order__listing")[:20]
    return Response(
        {
            **PublicUserSerializer(user).data,
            "reviews": [
                {
                    "id": r.id,
                    "reviewer": r.reviewer.username,
                    "rating": r.rating,
                    "comment": r.comment,
                    "listing": r.order.listing.title,
                    "category": r.order.listing.category,
                    "created_at": r.created_at,
                }
                for r in reviews
            ],
        }
    )


OTP_LABEL = {
    OneTimeCode.Purpose.WITHDRAW: "withdrawal",
    OneTimeCode.Purpose.PASSWORD: "password change",
    OneTimeCode.Purpose.HANDOVER: "handover confirmation",
    OneTimeCode.Purpose.VERIFY_EMAIL: "email verification",
    OneTimeCode.Purpose.RESET: "password reset",
}


class OtpView(APIView):
    throttle_scope = "otp"

    def post(self, request):
        purpose = request.data.get("purpose")
        # Reset codes are only issued through the unauthenticated reset endpoint.
        if purpose not in OneTimeCode.Purpose.values or purpose == OneTimeCode.Purpose.RESET:
            raise ValidationError({"purpose": "Unknown purpose."})
        if purpose == OneTimeCode.Purpose.VERIFY_EMAIL and request.user.email_verified:
            raise ValidationError({"detail": "Your email is already verified."})
        code = OneTimeCode.issue(request.user, purpose)
        channels = send_code(request.user, code, OTP_LABEL[purpose])
        data = {"sent_to": mask_email(request.user.email), "channels": channels}
        if settings.OTP_ECHO:
            data["dev_code"] = code  # test environments only - no SMS/email gateway configured
        return Response(data)


class PasswordResetRequest(APIView):
    """Always answers the same way so it can't be used to discover which emails have accounts."""

    permission_classes = [AllowAny]
    throttle_scope = "reset"

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        if not email:
            raise ValidationError({"email": "Enter your email."})
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        data = {"detail": "If an account exists for that email, we've sent a 6-digit reset code."}
        if user:
            code = OneTimeCode.issue(user, OneTimeCode.Purpose.RESET)
            send_code(user, code, OTP_LABEL[OneTimeCode.Purpose.RESET])
            if settings.OTP_ECHO:
                data["dev_code"] = code
        return Response(data)


class PasswordResetConfirm(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "reset"

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        email = (request.data.get("email") or "").strip()
        new = request.data.get("new_password") or ""
        # Validate first (independent of any account, so it can't reveal one) and before
        # spending the code, so a weak password doesn't burn it.
        try:
            validate_password(new)
        except DjangoValidationError as e:
            raise ValidationError({"new_password": e.messages})
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        # Same error whether the account is missing or the code is wrong.
        if not user or not OneTimeCode.consume(user, OneTimeCode.Purpose.RESET, request.data.get("code")):
            raise ValidationError({"code": "Invalid or expired code."})
        user.set_password(new)
        user.save(update_fields=["password"])
        notify(user, "Password changed", "Your password was reset. If this wasn't you, contact support immediately.", "/dashboard/settings")
        return Response({"ok": True})


@api_view(["POST"])
def verify_email(request):
    user = request.user
    if user.email_verified:
        return Response(MeSerializer(user).data)
    if not OneTimeCode.consume(user, OneTimeCode.Purpose.VERIFY_EMAIL, request.data.get("otp")):
        raise ValidationError({"otp": "Invalid or expired code."})
    user.email_verified = True
    user.save(update_fields=["email_verified"])
    return Response(MeSerializer(user).data)


class AvatarView(APIView):
    def post(self, request):
        f = request.FILES.get("avatar")
        if not f:
            raise ValidationError({"avatar": "Choose an image."})
        validate_upload(f, images_only=True)
        if f.size > 2 * 1024 * 1024:
            raise ValidationError({"avatar": "Avatar must be 2 MB or smaller."})
        user = request.user
        if user.avatar:
            user.avatar.delete(save=False)
        ext = os.path.splitext(f.name)[1].lower()[:5] or ".jpg"
        user.avatar.save(f"{user.pk}-{uuid.uuid4().hex[:8]}{ext}", f, save=True)
        return Response(MeSerializer(user).data)

    def delete(self, request):
        user = request.user
        if user.avatar:
            user.avatar.delete(save=True)
        return Response(MeSerializer(user).data)


@api_view(["POST"])
def change_password(request):
    from django.contrib.auth.password_validation import validate_password

    user = request.user
    if not user.check_password(request.data.get("current_password") or ""):
        raise ValidationError({"current_password": "Current password is incorrect."})
    if not OneTimeCode.consume(user, OneTimeCode.Purpose.PASSWORD, request.data.get("otp")):
        raise ValidationError({"otp": "Invalid or expired code."})
    new = request.data.get("new_password") or ""
    validate_password(new, user)
    user.set_password(new)
    user.save()
    return Response({"ok": True})


class KycView(APIView):
    def get(self, request):
        latest = request.user.kyc_submissions.first()
        return Response(
            {"kyc_status": request.user.kyc_status, "submission": KycSubmissionSerializer(latest).data if latest else None}
        )

    def post(self, request):
        user = request.user
        if user.kyc_status in (User.Kyc.PENDING, User.Kyc.VERIFIED):
            raise ValidationError({"detail": "Your verification is already " + user.get_kyc_status_display().lower() + "."})
        front = request.FILES.get("front")
        if not front:
            raise ValidationError({"front": "Upload the front of your document."})
        for f in (front, request.FILES.get("back"), request.FILES.get("selfie")):
            validate_upload(f)
        doc_type = request.data.get("doc_type")
        if doc_type not in KycSubmission.DocType.values:
            raise ValidationError({"doc_type": "Choose a document type."})
        number = (request.data.get("doc_number") or "").strip()
        name = (request.data.get("full_name") or "").strip()
        if not number or not name:
            raise ValidationError({"detail": "Full name and document number are required."})
        with transaction.atomic():
            sub = KycSubmission.objects.create(
                user=user,
                full_name=name[:120],
                doc_type=doc_type,
                doc_number_enc=encrypt_text(number[:40]),
                front_ref=store_private_file(front, "kyc"),
                back_ref=store_private_file(request.FILES["back"], "kyc") if request.FILES.get("back") else "",
                selfie_ref=store_private_file(request.FILES["selfie"], "kyc") if request.FILES.get("selfie") else "",
            )
            user.kyc_status = User.Kyc.PENDING
            user.save(update_fields=["kyc_status"])
        return Response(KycSubmissionSerializer(sub).data, status=status.HTTP_201_CREATED)


class NotificationList(generics.ListAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        resp = super().list(request, *args, **kwargs)
        resp.data["unread"] = Notification.objects.filter(user=request.user, is_read=False).count()
        return resp


@api_view(["POST"])
def notifications_read(request):
    qs = Notification.objects.filter(user=request.user, is_read=False)
    if request.data.get("id"):
        qs = qs.filter(id=request.data["id"])
    qs.update(is_read=True)
    return Response({"ok": True})


# --- Admin --------------------------------------------------------------


class AdminKycList(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = AdminKycSerializer

    def get_queryset(self):
        qs = KycSubmission.objects.select_related("user")
        st = self.request.query_params.get("status", "pending")
        return qs if st == "all" else qs.filter(status=st)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_kyc_file(request, pk, which):
    sub = get_object_or_404(KycSubmission, pk=pk)
    ref = {"front": sub.front_ref, "back": sub.back_ref, "selfie": sub.selfie_ref}.get(which)
    if not ref:
        return Response(status=404)
    data, name, ctype = read_private_file(ref)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'inline; filename="{name}"'
    resp["Cache-Control"] = "no-store"
    return resp


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_kyc_decide(request, pk):
    sub = get_object_or_404(KycSubmission, pk=pk, status=KycSubmission.Status.PENDING)
    approve = request.data.get("decision") == "approve"
    note = (request.data.get("note") or "")[:300]
    if not approve and not note:
        raise ValidationError({"note": "Give the user a reason for rejection."})
    with transaction.atomic():
        sub.status = KycSubmission.Status.APPROVED if approve else KycSubmission.Status.REJECTED
        sub.reviewer, sub.review_note, sub.reviewed_at = request.user, note, timezone.now()
        sub.save()
        sub.user.kyc_status = User.Kyc.VERIFIED if approve else User.Kyc.REJECTED
        sub.user.save(update_fields=["kyc_status"])
    notify(
        sub.user,
        "Identity verified ✓" if approve else "Identity verification rejected",
        "You now have a Verified badge and no trade limits." if approve else note,
        "/dashboard/kyc",
    )
    log_admin(request, f"kyc.{'approve' if approve else 'reject'}", sub.user, f"KYC {'approved' if approve else 'rejected'} for @{sub.user.username}" + (f": {note}" if note else ""))
    return Response(AdminKycSerializer(sub).data)


class AdminUserList(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = MeSerializer

    def get_queryset(self):
        qs = User.objects.order_by("-date_joined")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(email__icontains=q) | Q(username__icontains=q) | Q(phone__icontains=q))
        return qs


@api_view(["POST"])
@permission_classes([IsStaff])
def admin_user_toggle(request, pk):
    user = get_object_or_404(User, pk=pk)
    if user == request.user or user.is_superuser:
        raise ValidationError({"detail": "You cannot suspend this account."})
    user.is_active = not user.is_active
    user.save(update_fields=["is_active"])
    log_admin(request, "user.reactivate" if user.is_active else "user.suspend", user, f"{'Reactivated' if user.is_active else 'Suspended'} @{user.username}")
    return Response(MeSerializer(user).data)


@api_view(["GET"])
@permission_classes([IsStaff])
def admin_user_detail(request, pk):
    from apps.escrow.models import Order
    from apps.wallet import ledger
    from apps.wallet.models import Account

    user = get_object_or_404(User, pk=pk)
    latest_kyc = user.kyc_submissions.first()
    orders = (
        Order.objects.filter(Q(buyer=user) | Q(seller=user))
        .select_related("listing", "buyer", "seller")
        .order_by("-created_at")[:10]
    )
    return Response(
        {
            "user": MeSerializer(user).data,
            "kyc": KycSubmissionSerializer(latest_kyc).data if latest_kyc else None,
            "balances": {
                "available": str(ledger.balance(user, Account.Kind.AVAILABLE)),
                "escrow": str(ledger.balance(user, Account.Kind.ESCROW)),
                "withdraw_hold": str(ledger.balance(user, Account.Kind.WITHDRAW_HOLD)),
            },
            "listings": user.listings.count(),
            "orders": [
                {
                    "id": o.id,
                    "code": o.code,
                    "title": o.listing.title,
                    "role": "buyer" if o.buyer_id == user.id else "seller",
                    "amount": str(o.amount),
                    "status": o.status,
                    "status_label": o.get_status_display(),
                    "created_at": o.created_at,
                }
                for o in orders
            ],
        }
    )


@api_view(["POST"])
def admin_user_staff(request, pk):
    """Grant/revoke admin (escrow agent) rights. Superusers only."""
    if not request.user.is_superuser:
        return Response({"detail": "Only a superuser can change staff rights."}, status=403)
    user = get_object_or_404(User, pk=pk)
    if user == request.user or user.is_superuser:
        raise ValidationError({"detail": "You cannot change this account's staff rights."})
    user.is_staff = not user.is_staff
    user.save(update_fields=["is_staff"])
    log_admin(request, "user.staff_grant" if user.is_staff else "user.staff_revoke", user, f"{'Granted' if user.is_staff else 'Removed'} admin rights for @{user.username}")
    return Response(MeSerializer(user).data)
