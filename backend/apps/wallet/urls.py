from django.urls import path

from . import payments, payout_accounts, views

urlpatterns = [
    path("wallet/summary/", views.summary),
    path("wallet/transactions/", views.transactions),
    path("wallet/methods/", views.methods),
    path("wallet/deposits/", views.DepositsView.as_view()),
    path("wallet/deposits/checkout/", payments.CheckoutView.as_view()),
    path("wallet/deposits/<int:pk>/", payments.deposit_detail),
    path("wallet/gateways/", payments.gateway_list),
    path("wallet/callback/bkash/", payments.bkash_callback),
    path("wallet/callback/nagad/", payments.nagad_callback),
    path("wallet/callback/sslcommerz/", payments.sslcommerz_callback),
    path("wallet/ipn/sslcommerz/", payments.sslcommerz_ipn),
    path("wallet/webhook/stripe/", payments.stripe_webhook),
    path("wallet/withdrawals/", views.WithdrawalsView.as_view()),
    path("wallet/payout-accounts/", payout_accounts.payout_accounts),
    path("wallet/payout-accounts/<int:pk>/", payout_accounts.payout_account_detail),
    path("me/export/transactions.csv", payout_accounts.export_transactions),
    path("admin/deposits/", views.AdminDeposits.as_view()),
    path("admin/deposits/<int:pk>/decide/", views.admin_deposit_decide),
    path("admin/withdrawals/", views.AdminWithdrawals.as_view()),
    path("admin/withdrawals/<int:pk>/decide/", views.admin_withdrawal_decide),
    path("admin/ledger-check/", views.admin_ledger_check),
]
