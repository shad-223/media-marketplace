from django.urls import path

from . import views

urlpatterns = [
    path("reports/", views.create_report),
    path("support/tickets/", views.tickets),
    path("support/tickets/<int:pk>/", views.ticket_detail),
    path("support/tickets/<int:pk>/reply/", views.ticket_reply),
    path("support/tickets/<int:pk>/close/", views.ticket_close),
    path("me/delete-request/", views.my_deletion_request),
    path("admin/audit/", views.admin_audit),
    path("admin/users/<int:pk>/adjust/", views.admin_user_adjust),
    path("admin/users/<int:pk>/revoke-kyc/", views.admin_user_revoke_kyc),
    path("admin/users/<int:pk>/temp-password/", views.admin_user_temp_password),
    path("admin/users/<int:pk>/listings/", views.admin_user_listings),
    path("admin/reports/", views.admin_reports),
    path("admin/reports/<int:pk>/decide/", views.admin_report_decide),
    path("admin/listings/<int:pk>/feature/", views.admin_listing_feature),
    path("admin/broadcast/", views.admin_broadcast),
    path("admin/export/<str:kind>.csv", views.admin_export),
    path("admin/support/", views.admin_tickets),
    path("admin/deletions/", views.admin_deletions),
    path("admin/deletions/<int:pk>/decide/", views.admin_deletion_decide),
]
