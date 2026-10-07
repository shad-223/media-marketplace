"""Admin audit trail. Call log_admin() after every admin decision; it never raises."""
import logging

logger = logging.getLogger(__name__)


def client_ip(request):
    fwd = request.META.get("HTTP_CF_CONNECTING_IP") or request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = (fwd.split(",")[0].strip() if fwd else "") or request.META.get("REMOTE_ADDR") or None
    return ip


def log_admin(request, action, target=None, summary="", **data):
    from .models import AdminAction

    try:
        AdminAction.objects.create(
            actor=request.user if getattr(request.user, "is_authenticated", False) else None,
            action=action[:40],
            target_type=target._meta.model_name if target is not None else "",
            target_id=str(target.pk) if target is not None else "",
            summary=(summary or action)[:300],
            data={k: (v if isinstance(v, (int, float, bool, type(None))) else str(v)) for k, v in data.items()},
            ip=client_ip(request),
        )
    except Exception:  # auditing must never break the admin action itself
        logger.exception("audit log failed for %s", action)
