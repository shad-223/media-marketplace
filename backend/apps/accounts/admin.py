from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Notification, User


@admin.register(User)
class MediaUserAdmin(UserAdmin):
    list_display = ("email", "username", "kyc_status", "is_staff", "is_active", "date_joined")
    list_filter = ("kyc_status", "is_staff", "is_active")
    fieldsets = UserAdmin.fieldsets + (("Media", {"fields": ("phone", "bio", "kyc_status")}),)


admin.site.register(Notification)
