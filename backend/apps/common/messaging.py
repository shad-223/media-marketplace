"""Outbound SMS + email. Both degrade to a log line when not configured, never raise."""
import json
import logging
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

log = logging.getLogger("media.messaging")


def send_sms(phone: str, text: str) -> bool:
    """Generic HTTP SMS gateway (BulkSMSBD-style: api_key, senderid, number, message as form fields).

    Configure SMS_API_URL / SMS_API_KEY / SMS_SENDER_ID. Unset -> logged no-op.
    """
    phone = (phone or "").strip()
    if not phone:
        return False
    if not settings.SMS_API_URL or not settings.SMS_API_KEY:
        log.info("SMS gateway not configured; would send to %s: %s", phone[-4:].rjust(len(phone), "*"), text[:40])
        return False
    data = urllib.parse.urlencode(
        {"api_key": settings.SMS_API_KEY, "senderid": settings.SMS_SENDER_ID, "number": phone, "message": text}
    ).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(settings.SMS_API_URL, data=data), timeout=10) as r:
            body = r.read(500).decode(errors="replace")
        log.info("SMS sent to ...%s (%s)", phone[-4:], body[:120])
        return 200 <= r.status < 300
    except Exception as e:  # network/gateway errors must not break the request
        log.warning("SMS send failed: %s", e)
        return False


def send_email(to: str, subject: str, body: str) -> bool:
    if not to:
        return False
    try:
        return bool(send_mail(subject, body, None, [to], fail_silently=False))
    except Exception as e:
        log.warning("Email send failed: %s", e)
        return False


def send_code(user, code: str, what: str) -> list:
    """Deliver a one-time code by email and (if the user has a phone) SMS. Returns channels attempted."""
    text = f"Your Media {what} code is {code}. It expires in 10 minutes. Never share it with anyone."
    channels = []
    if user.email:
        send_email(user.email, f"Your Media {what} code", text)
        channels.append("email")
    if user.phone:
        send_sms(user.phone, text)
        channels.append("sms")
    return channels


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return (name[:2] + "***@" + domain) if domain else email
