from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("auth/register/", views.register),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/otp/", views.OtpView.as_view()),
    path("auth/change-password/", views.change_password),
    path("me/", views.MeView.as_view()),
    path("me/kyc/", views.KycView.as_view()),
    path("notifications/", views.NotificationList.as_view()),
    path("notifications/read/", views.notifications_read),
    path("users/<str:username>/", views.public_profile),
    path("admin/kyc/", views.AdminKycList.as_view()),
    path("admin/kyc/<int:pk>/decide/", views.admin_kyc_decide),
    path("admin/kyc/<int:pk>/file/<str:which>/", views.admin_kyc_file),
    path("admin/users/", views.AdminUserList.as_view()),
    path("admin/users/<int:pk>/toggle/", views.admin_user_toggle),
]
