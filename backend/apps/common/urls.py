from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("stats/", views.public_stats),
    path("config/", views.public_config),
    path("admin/settings/", views.admin_settings),
    path("contest/leaderboard/", views.contest_leaderboard),
]
