from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import notify
from apps.common.crypto import read_private_file, store_private_file
from apps.common.permissions import validate_upload
from apps.common.realtime import broadcast, user_group
from apps.market.models import Listing

from .models import Conversation, ConversationMessage, SavedSearch

LIVE = (Listing.Status.APPROVED, Listing.Status.RESERVED, Listing.Status.SOLD, Listing.Status.PAUSED)


def _conv_for(user, pk):
    conv = get_object_or_404(Conversation.objects.select_related("listing", "buyer", "seller"), pk=pk)
    if user.id not in (conv.buyer_id, conv.seller_id):
        raise PermissionDenied()
    return conv


def _msg(m, user):
    return {
        "id": m.id,
        "sender": m.sender.username,
        "mine": m.sender_id == user.id,
        "body": m.body,
        "has_attachment": bool(m.attachment_ref),
        "attachment_name": m.attachment_ref.split("|")[1] if m.attachment_ref else None,
        "is_read": m.is_read,
        "created_at": m.created_at,
    }


def _conv(c, user, unread=0, last=None):
    other = c.other(user)
    return {
        "id": c.id,
        "role": "buyer" if user.id == c.buyer_id else "seller",
        "listing": {"id": c.listing_id, "title": c.listing.title, "category": c.listing.category, "price": str(c.listing.price), "status": c.listing.status},
        "other": {"username": other.username, "is_verified": other.is_verified},
        "unread": unread,
        "last_message": (last.body[:140] if last else ""),
        "last_at": last.created_at if last else c.updated_at,
    }


class ConversationsView(APIView):
    """GET my conversations (buyer or seller side). POST {listing, body} starts or continues one."""

    def get(self, request):
        u = request.user
        qs = (
            Conversation.objects.filter(Q(buyer=u) | Q(seller=u))
            .select_related("listing", "buyer", "seller")
            .annotate(unread=Count("messages", filter=Q(messages__is_read=False) & ~Q(messages__sender=u)))
        )
        out = []
        for c in qs[:200]:
            last = c.messages.order_by("-created_at", "-id").first()
            out.append(_conv(c, u, c.unread, last))
        return Response({"results": out, "unread": sum(x["unread"] for x in out)})

    def post(self, request):
        listing = get_object_or_404(Listing, pk=request.data.get("listing"), status__in=LIVE)
        if listing.seller_id == request.user.id:
            raise ValidationError({"detail": "You cannot message yourself about your own listing."})
        body = (request.data.get("body") or "").strip()
        with transaction.atomic():
            conv, _ = Conversation.objects.get_or_create(listing=listing, buyer=request.user, defaults={"seller": listing.seller})
            if body:
                _send(conv, request.user, body)
        return Response(_conv(conv, request.user), status=201)


def _send(conv, user, body, attachment_ref=""):
    m = ConversationMessage.objects.create(conversation=conv, sender=user, body=body[:4000] or "📎 Attachment", attachment_ref=attachment_ref)
    Conversation.objects.filter(pk=conv.pk).update(updated_at=m.created_at)
    other = conv.other(user)
    notify(other, f"New message from @{user.username}", f"About “{conv.listing.title}”: {m.body[:100]}", f"/dashboard/messages?c={conv.pk}")
    payload = {"event": "inbox", "conversation": conv.pk}
    broadcast(user_group(other.id), payload)
    broadcast(user_group(user.id), payload)
    return m


class MessagesView(APIView):
    def get(self, request, pk):
        conv = _conv_for(request.user, pk)
        conv.messages.filter(is_read=False).exclude(sender=request.user).update(is_read=True)
        msgs = conv.messages.select_related("sender")
        return Response({"conversation": _conv(conv, request.user), "messages": [_msg(m, request.user) for m in msgs]})

    def post(self, request, pk):
        conv = _conv_for(request.user, pk)
        body = (request.data.get("body") or "").strip()
        f = request.FILES.get("file")
        if not body and not f:
            raise ValidationError({"body": "Write a message."})
        validate_upload(f)
        m = _send(conv, request.user, body, store_private_file(f, "inbox") if f else "")
        return Response(_msg(m, request.user), status=201)


@api_view(["GET"])
def attachment(request, pk, mid):
    conv = _conv_for(request.user, pk)
    m = get_object_or_404(ConversationMessage, pk=mid, conversation=conv)
    if not m.attachment_ref:
        return Response(status=404)
    data, name, ctype = read_private_file(m.attachment_ref)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'attachment; filename="{name}"'
    resp["Cache-Control"] = "no-store"
    return resp


class SavedSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSearch
        fields = ["id", "name", "params", "created_at", "last_notified_at"]
        read_only_fields = ["created_at", "last_notified_at"]

    def validate_params(self, v):
        if not isinstance(v, dict):
            raise serializers.ValidationError("params must be an object")
        clean = {k: str(v[k])[:100] for k in SavedSearch.KEYS if v.get(k) not in (None, "")}
        if not clean:
            raise serializers.ValidationError("Choose at least one filter or a search term.")
        return clean


class SavedSearchesView(APIView):
    def get(self, request):
        return Response(SavedSearchSerializer(SavedSearch.objects.filter(user=request.user), many=True).data)

    def post(self, request):
        if SavedSearch.objects.filter(user=request.user).count() >= 20:
            raise ValidationError({"detail": "You can keep up to 20 saved searches."})
        s = SavedSearchSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(SavedSearchSerializer(s.save(user=request.user)).data, status=201)


@api_view(["DELETE"])
def saved_search_delete(request, pk):
    get_object_or_404(SavedSearch, pk=pk, user=request.user).delete()
    return Response(status=204)
