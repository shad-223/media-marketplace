from django.conf import settings
from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([AllowAny])
def public_stats(request):
    from apps.accounts.models import User
    from apps.escrow.models import Order
    from apps.market.models import Listing

    volume = Order.objects.filter(status=Order.Status.COMPLETED).aggregate(s=Sum("amount"))["s"] or 0
    return Response(
        {
            "volume_traded": str(volume),
            "active_users": User.objects.filter(is_active=True).count(),
            "listed_assets": Listing.objects.filter(status=Listing.Status.APPROVED).count(),
            "completed_trades": Order.objects.filter(status=Order.Status.COMPLETED).count(),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_config(request):
    return Response(
        {
            "platform_fee_percent": str(settings.PLATFORM_FEE_PERCENT),
            "buyer_protection_hours": settings.BUYER_PROTECTION_HOURS,
            "unverified_trade_limit": str(settings.UNVERIFIED_TRADE_LIMIT),
            "min_withdrawal": str(settings.MIN_WITHDRAWAL),
            "usd_rate": str(settings.USD_RATE),
            "payments_sandbox": settings.PAYMENTS_SANDBOX,
        }
    )
