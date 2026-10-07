from rest_framework.permissions import BasePermission

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


class IsStaff(BasePermission):
    """Admin / escrow agent."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


def validate_upload(f, images_only=False):
    from rest_framework.exceptions import ValidationError

    if f is None:
        return
    allowed = {t for t in ALLOWED_UPLOAD_TYPES if t.startswith("image/")} if images_only else ALLOWED_UPLOAD_TYPES
    if getattr(f, "content_type", "") not in allowed:
        raise ValidationError({"file": f"Unsupported file type. Allowed: {', '.join(sorted(allowed))}"})
    if f.size > MAX_UPLOAD_BYTES:
        raise ValidationError({"file": "File is larger than 8 MB."})
