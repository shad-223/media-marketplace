from django.urls import path

from . import views

urlpatterns = [
    path("wallet/summary/", views.summary),
    path("wallet/transactions/", views.transactions),
    path("wallet/methods/", views.methods),
    path("wallet/deposits/", views.DepositsView.as_view()),
    path("wallet/withdrawals/", views.WithdrawalsView.as_view()),
    path("admin/deposits/", views.AdminDeposits.as_view()),
    path("admin/deposits/<int:pk>/decide/", views.admin_deposit_decide),
    path("admin/withdrawals/", views.AdminWithdrawals.as_view()),
    path("admin/withdrawals/<int:pk>/decide/", views.admin_withdrawal_decide),
    path("admin/ledger-check/", views.admin_ledger_check),
]
