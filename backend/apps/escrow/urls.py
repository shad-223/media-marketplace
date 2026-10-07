from django.urls import path

from . import views

urlpatterns = [
    path("orders/", views.OrdersView.as_view()),
    path("orders/<int:pk>/", views.order_detail),
    path("orders/<int:pk>/action/", views.order_action),
    path("orders/<int:pk>/messages/", views.MessagesView.as_view()),
    path("orders/<int:pk>/messages/<int:mid>/file/", views.message_attachment),
    path("admin/overview/", views.admin_overview),
    path("admin/orders/", views.AdminOrders.as_view()),
    path("admin/orders/<int:pk>/action/", views.admin_order_action),
    path("admin/disputes/", views.AdminDisputes.as_view()),
]
