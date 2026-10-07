"""Admin-editable platform settings (one row). env settings.* are only the defaults."""
from django.conf import settings
from django.core.cache import cache
from django.db import models

CACHE_KEY = "media:site-settings"
CACHE_SECONDS = 30  # per-process cache; other workers pick up edits within this window


def default_fee():
    return settings.PLATFORM_FEE_PERCENT


def default_protection_hours():
    return settings.BUYER_PROTECTION_HOURS


def default_trade_limit():
    return settings.UNVERIFIED_TRADE_LIMIT


def default_min_withdrawal():
    return settings.MIN_WITHDRAWAL


def default_usd_rate():
    return settings.USD_RATE


METHODS = ("bkash", "nagad", "rocket", "bank", "card")


class SiteSetting(models.Model):
    announcement_text = models.CharField(
        max_length=300,
        blank=True,
        default="🔒 Every trade is protected by Media Escrow — money is released only after you confirm the handover.",
    )
    announcement_enabled = models.BooleanField(default=True)
    platform_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=default_fee)
    buyer_protection_hours = models.PositiveIntegerField(default=default_protection_hours)
    unverified_trade_limit = models.DecimalField(max_digits=12, decimal_places=2, default=default_trade_limit)
    min_withdrawal = models.DecimalField(max_digits=12, decimal_places=2, default=default_min_withdrawal)
    usd_rate = models.DecimalField(max_digits=8, decimal_places=2, default=default_usd_rate)
    support_email = models.EmailField(blank=True)
    support_phone = models.CharField(max_length=30, blank=True)
    # Where buyers send manual deposits, and how.
    bkash_number = models.CharField(max_length=60, blank=True)
    bkash_instructions = models.CharField(max_length=500, blank=True)
    nagad_number = models.CharField(max_length=60, blank=True)
    nagad_instructions = models.CharField(max_length=500, blank=True)
    rocket_number = models.CharField(max_length=60, blank=True)
    rocket_instructions = models.CharField(max_length=500, blank=True)
    bank_number = models.CharField(max_length=120, blank=True, help_text="Account name, number, bank & branch")
    bank_instructions = models.CharField(max_length=500, blank=True)
    card_number = models.CharField(max_length=60, blank=True)
    card_instructions = models.CharField(max_length=500, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete(CACHE_KEY)

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        cache.delete(CACHE_KEY)

    def deposit_methods(self):
        return {m: {"account": getattr(self, f"{m}_number"), "instructions": getattr(self, f"{m}_instructions")} for m in METHODS}


def get_site_settings() -> SiteSetting:
    """The saved row (cached), or an unsaved instance carrying the env defaults when none exists yet."""
    obj = cache.get(CACHE_KEY)
    if obj is not None:
        return obj
    obj = SiteSetting.objects.filter(pk=1).first()
    if obj is None:
        return SiteSetting()  # not cached so env/override_settings changes apply immediately
    cache.set(CACHE_KEY, obj, CACHE_SECONDS)
    return obj
