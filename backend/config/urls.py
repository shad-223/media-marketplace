from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.market.urls")),
    path("api/", include("apps.wallet.urls")),
    path("api/", include("apps.escrow.urls")),
    path("api/", include("apps.common.urls")),
]
# Public uploads (listing covers only; KYC docs and proofs live encrypted in PRIVATE_ROOT and are never served here).
urlpatterns += [re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT})]
