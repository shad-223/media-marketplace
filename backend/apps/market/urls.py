from django.urls import path

from . import seller, views

urlpatterns = [
    path("categories/", views.categories),
    path("listings/", views.MarketplaceList.as_view()),
    path("listings/activity/", views.recent_activity),
    path("listings/<int:pk>/", views.listing_detail),
    path("me/listings/", views.MyListings.as_view()),
    path("me/listings/<int:pk>/", views.MyListingDetail.as_view()),
    path("me/listings/<int:pk>/images/", seller.listing_images),
    path("me/listings/<int:pk>/images/reorder/", seller.listing_images_reorder),
    path("me/listings/<int:pk>/images/<int:image_id>/", seller.listing_image_delete),
    path("me/listings/<int:pk>/request-featured/", seller.request_featured),
    path("me/seller-stats/", seller.seller_stats),
    path("me/export/sales.csv", seller.export_sales),
    path("me/saved/", views.SavedView.as_view()),
    path("offers/", views.OffersView.as_view()),
    path("offers/<int:pk>/", views.offer_action),
    path("admin/listings/", views.AdminListings.as_view()),
    path("admin/listings/<int:pk>/decide/", views.admin_listing_decide),
    path("admin/listings/<int:pk>/proof/", views.admin_listing_proof),
    path("admin/listings/<int:pk>/check-ownership/", views.admin_check_ownership),
]
