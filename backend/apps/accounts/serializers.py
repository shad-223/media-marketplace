from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from rest_framework import serializers

from .models import KycSubmission, Notification, User


class PublicUserSerializer(serializers.ModelSerializer):
    is_verified = serializers.BooleanField(read_only=True)
    rating = serializers.SerializerMethodField()
    completed_trades = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "bio", "avatar", "is_verified", "email_verified", "rating", "completed_trades", "date_joined"]

    def get_rating(self, obj):
        return obj.rating()

    def get_avatar(self, obj):
        return obj.avatar.url if obj.avatar else None

    def get_completed_trades(self, obj):
        from apps.escrow.models import Order

        return Order.objects.filter(Q(buyer=obj) | Q(seller=obj), status=Order.Status.COMPLETED).count()


class MeSerializer(PublicUserSerializer):
    class Meta:
        model = User
        fields = PublicUserSerializer.Meta.fields + ["email", "phone", "kyc_status", "is_staff", "is_superuser", "is_active"]
        read_only_fields = ["email", "email_verified", "kyc_status", "is_staff", "is_superuser", "is_active", "date_joined"]


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.RegexField(r"^[A-Za-z0-9_.]{3,30}$", error_messages={"invalid": "3-30 letters, digits, _ or ."})
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate_email(self, v):
        if User.objects.filter(email__iexact=v).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return v.lower()

    def validate_username(self, v):
        if User.objects.filter(username__iexact=v).exists():
            raise serializers.ValidationError("This username is taken.")
        return v

    def validate_password(self, v):
        validate_password(v)
        return v

    def create(self, data):
        return User.objects.create_user(**data)


class KycSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = KycSubmission
        fields = ["id", "full_name", "doc_type", "status", "review_note", "created_at", "reviewed_at"]


class AdminKycSerializer(serializers.ModelSerializer):
    user = MeSerializer(read_only=True)
    doc_number = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()

    class Meta:
        model = KycSubmission
        fields = ["id", "user", "full_name", "doc_type", "doc_number", "files", "status", "review_note", "created_at", "reviewed_at"]

    def get_doc_number(self, obj):
        from apps.common.crypto import decrypt_text

        return decrypt_text(obj.doc_number_enc)

    def get_files(self, obj):
        return [k for k, ref in (("front", obj.front_ref), ("back", obj.back_ref), ("selfie", obj.selfie_ref)) if ref]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "body", "link", "is_read", "created_at"]
