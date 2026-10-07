from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
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
from apps.common.permissions import IsStaff, validate_upload

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
    user = get_object_or_404(User, username__iexact=username, is_active=True)
    return Response(PublicUserSerializer(user).data)


class OtpView(APIView):
    throttle_scope = "otp"

    def post(self, request):
        purpose = request.data.get("purpose")
        if purpose not in OneTimeCode.Purpose.values:
            raise ValidationError({"purpose": "Unknown purpose."})
        code = OneTimeCode.issue(request.user, purpose)
        send_mail(
            "Your Media verification code",
            f"Your code is {code}. It expires in 10 minutes. Never share it with anyone.",
            None,
            [request.user.email],
            fail_silently=True,
        )
        data = {"sent_to": request.user.email}
        if settings.OTP_ECHO:
            data["dev_code"] = code  # test environments only — no SMS/email gateway configured
        return Response(data)


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
    return Response(AdminKycSerializer(sub).data)


class AdminUserList(generics.ListAPIView):
    permission_classes = [IsStaff]
    serializer_class = MeSerializer

    def get_queryset(self):
        qs = User.objects.order_by("-date_joined")
        q = self.request.query_params.get("q")
        if q:
            from django.db.models import Q

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
    return Response(MeSerializer(user).data)
