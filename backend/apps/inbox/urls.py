from django.urls import path

from . import views

urlpatterns = [
    path("inbox/", views.ConversationsView.as_view()),
    path("inbox/<int:pk>/", views.MessagesView.as_view()),
    path("inbox/<int:pk>/messages/<int:mid>/file/", views.attachment),
    path("me/saved-searches/", views.SavedSearchesView.as_view()),
    path("me/saved-searches/<int:pk>/", views.saved_search_delete),
]
