from decimal import Decimal

from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import CATEGORY_GROUP, Listing, Offer, Review


class SellerMiniSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    is_verified = serializers.BooleanField()


class ListingCardSerializer(serializers.ModelSerializer):
    seller = SellerMiniSerializer(read_only=True)
    group = serializers.SerializerMethodField()
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    thumbnail = serializers.SerializerMethodField()
    is_saved = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "id", "title", "category", "category_label", "group", "niche", "audience", "monthly_traffic",
            "monthly_revenue", "age_months", "monetized", "price", "allow_offers", "thumbnail", "is_verified",
            "status", "seller", "is_saved", "approved_at", "created_at", "is_featured",
        ]

    def get_group(self, obj):
        return CATEGORY_GROUP.get(obj.category, "")

    def get_thumbnail(self, obj):
        return obj.thumbnail.url if obj.thumbnail else None

    def get_is_saved(self, obj):
        saved = self.context.get("saved_ids")
        return obj.id in saved if saved is not None else False


class ListingDetailSerializer(ListingCardSerializer):
    seller = PublicUserSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    has_proof = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta(ListingCardSerializer.Meta):
        fields = ListingCardSerializer.Meta.fields + [
            "description", "asset_url", "country", "views", "status_label", "admin_note", "has_proof", "updated_at",
            "verify_code", "ownership_found", "ownership_checked_at", "images", "featured_requested_at",
        ]

    def get_has_proof(self, obj):
        return bool(obj.proof_ref)

    def get_images(self, obj):
        from .seller import ListingImageSerializer

        return ListingImageSerializer(obj.images.all(), many=True).data


class ListingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = [
            "category", "title", "description", "asset_url", "niche", "country", "audience", "monthly_traffic",
            "monthly_revenue", "age_months", "monetized", "price", "allow_offers", "thumbnail",
        ]

    def validate_price(self, v):
        if v < Decimal("100"):
            raise serializers.ValidationError("Minimum price is ৳100.")
        return v

    def validate_thumbnail(self, f):
        from apps.common.permissions import validate_upload

        validate_upload(f, images_only=True)
        return f


class OfferSerializer(serializers.ModelSerializer):
    buyer = SellerMiniSerializer(read_only=True)
    listing = ListingCardSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Offer
        fields = ["id", "listing", "buyer", "amount", "message", "counter_amount", "counter_message", "status", "status_label", "created_at"]


class ReviewSerializer(serializers.ModelSerializer):
    reviewer = SellerMiniSerializer(read_only=True)

    class Meta:
        model = Review
        fields = ["id", "reviewer", "rating", "comment", "created_at"]
