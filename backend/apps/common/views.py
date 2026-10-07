from datetime import date

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .permissions import IsStaff


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
    from .models import get_site_settings

    s = get_site_settings()
    return Response(
        {
            "platform_fee_percent": str(s.platform_fee_percent),
            "buyer_protection_hours": s.buyer_protection_hours,
            "unverified_trade_limit": str(s.unverified_trade_limit),
            "min_withdrawal": str(s.min_withdrawal),
            "usd_rate": str(s.usd_rate),
            "payments_sandbox": settings.PAYMENTS_SANDBOX,
            "announcement": s.announcement_text if s.announcement_enabled else "",
            "support_email": s.support_email,
            "support_phone": s.support_phone,
            "deposit_methods": s.deposit_methods(),
        }
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsStaff])
def admin_settings(request):
    from .models import SiteSetting, get_site_settings
    from .serializers import SiteSettingSerializer

    current = get_site_settings()
    if request.method == "GET":
        return Response(SiteSettingSerializer(current).data)
    obj = SiteSetting.objects.filter(pk=1).first() or current
    s = SiteSettingSerializer(obj, data=request.data, partial=True)
    s.is_valid(raise_exception=True)
    s.save()
    return Response(s.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def contest_leaderboard(request):
    """Monthly ranking by completed escrow volume. Both sides of a trade earn its full amount;
    refunded and still-open orders don't count. The month is when escrow was released (closed_at)."""
    from apps.accounts.models import User
    from apps.escrow.models import Order

    today = timezone.localdate()
    raw = request.query_params.get("month") or f"{today:%Y-%m}"
    try:
        year, month = (int(x) for x in raw.split("-"))
        start = date(year, month, 1)
    except (ValueError, TypeError):
        return Response({"detail": "month must be YYYY-MM"}, status=400)
    end = date(year + (month == 12), month % 12 + 1, 1)
    orders = Order.objects.filter(
        status=Order.Status.COMPLETED, closed_at__date__gte=start, closed_at__date__lt=end
    ).values_list("buyer_id", "seller_id", "amount")
    totals = {}
    for buyer_id, seller_id, amount in orders:
        for uid in (buyer_id, seller_id):
            vol, n = totals.get(uid, (0, 0))
            totals[uid] = (vol + amount, n + 1)
    ranked = sorted(totals.items(), key=lambda kv: (-kv[1][0], -kv[1][1], kv[0]))[:20]
    users = {u.id: u for u in User.objects.filter(id__in=[uid for uid, _ in ranked])}
    return Response(
        {
            "month": f"{start:%Y-%m}",
            "results": [
                {
                    "rank": i + 1,
                    "username": users[uid].username,
                    "is_verified": users[uid].is_verified,
                    "avatar": users[uid].avatar.url if users[uid].avatar else None,
                    "volume": str(vol),
                    "trades": n,
                }
                for i, (uid, (vol, n)) in enumerate(ranked)
            ],
        }
    )
