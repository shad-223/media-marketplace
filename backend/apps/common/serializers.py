from decimal import Decimal

from rest_framework import serializers

from .models import SiteSetting


class SiteSettingSerializer(serializers.ModelSerializer):
    platform_fee_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("30"))
    buyer_protection_hours = serializers.IntegerField(min_value=0, max_value=720)
    unverified_trade_limit = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    min_withdrawal = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("1000000"))
    usd_rate = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal("1"), max_value=Decimal("10000"))

    class Meta:
        model = SiteSetting
        exclude = ["id"]
        read_only_fields = ["updated_at"]
