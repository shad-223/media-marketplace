import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.db.models import Avg
from django.utils import timezone


class MediaUserManager(UserManager):
    def create_user(self, email, username=None, password=None, **extra):
        username = username or email.split("@")[0]
        return super().create_user(username=username, email=email, password=password, **extra)

    def create_superuser(self, email, username=None, password=None, **extra):
        username = username or email.split("@")[0]
        return super().create_superuser(username=username, email=email, password=password, **extra)


class User(AbstractUser):
    """One account is both buyer and seller. is_staff = admin / escrow agent."""

    class Kyc(models.TextChoices):
        NONE = "none", "Not verified"
        PENDING = "pending", "Pending review"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    bio = models.CharField(max_length=280, blank=True)
    kyc_status = models.CharField(max_length=10, choices=Kyc.choices, default=Kyc.NONE)
    email_verified = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="avatars/", blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    objects = MediaUserManager()

    @property
    def is_verified(self):
        return self.kyc_status == self.Kyc.VERIFIED

    def rating(self):
        from apps.market.models import Review

        agg = Review.objects.filter(reviewee=self).aggregate(avg=Avg("rating"), n=models.Count("id"))
        return {"average": round(agg["avg"] or 0, 2), "count": agg["n"]}


class KycSubmission(models.Model):
    class DocType(models.TextChoices):
        NID = "nid", "National ID"
        PASSPORT = "passport", "Passport"
        DRIVING = "driving", "Driving licence"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="kyc_submissions")
    full_name = models.CharField(max_length=120)
    doc_type = models.CharField(max_length=10, choices=DocType.choices)
    doc_number_enc = models.TextField()  # AES-256-GCM, see apps.common.crypto
    front_ref = models.CharField(max_length=300)
    back_ref = models.CharField(max_length=300, blank=True)
    selfie_ref = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewer = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    review_note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class OneTimeCode(models.Model):
    """2FA codes for withdrawals, password changes and escrow handovers."""

    class Purpose(models.TextChoices):
        WITHDRAW = "withdraw", "Withdrawal"
        PASSWORD = "password", "Password change"
        HANDOVER = "handover", "Confirm handover"
        RESET = "reset", "Password reset"
        VERIFY_EMAIL = "verify_email", "Verify email"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps")
    purpose = models.CharField(max_length=16, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @staticmethod
    def _hash(code):
        return hashlib.sha256(code.encode()).hexdigest()

    @classmethod
    def issue(cls, user, purpose):
        cls.objects.filter(user=user, purpose=purpose, used=False).update(used=True)
        code = f"{secrets.randbelow(10**6):06d}"
        cls.objects.create(
            user=user, purpose=purpose, code_hash=cls._hash(code), expires_at=timezone.now() + timedelta(minutes=10)
        )
        return code

    @classmethod
    def consume(cls, user, purpose, code):
        otp = cls.objects.filter(user=user, purpose=purpose, used=False).order_by("-created_at").first()
        if not otp or otp.expires_at < timezone.now() or otp.attempts >= 5:
            return False
        if not secrets.compare_digest(otp.code_hash, cls._hash(str(code or "").strip())):
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            return False
        otp.used = True
        otp.save(update_fields=["used"])
        return True


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=140)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


def notify(user, title, body="", link=""):
    Notification.objects.create(user=user, title=title, body=body, link=link)
