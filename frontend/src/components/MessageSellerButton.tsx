"use client";

import { useMutation } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { Button, ErrorNote, Modal, Textarea } from "./ui";

/** Opens (or reuses) a pre-sale conversation with the seller of a listing. Hidden for the seller. */
export function MessageSellerButton({ listingId, sellerId, title }: { listingId: number; sellerId: number; title: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const start = useMutation({
    mutationFn: () => api<{ id: number }>("/inbox/", { body: { listing: listingId, body } }),
    onSuccess: (c) => router.push(`/dashboard/messages?c=${c.id}`),
  });
  if (me && me.id === sellerId) return null;
  return (
    <>
      <Button size="lg" variant="ghost" className="w-full" onClick={() => (me ? setOpen(true) : router.push(`/login?next=/listings/${listingId}`))}>
        <MessageCircle className="h-4 w-4" /> Message seller
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ask the seller">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">About “{title}”. Ask about metrics, income proof or the transfer process.</p>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi! Is the channel still monetized?" />
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">⚠ Never pay or share passwords outside Media escrow. Off-platform deals aren’t protected.</p>
          <ErrorNote error={start.error} />
          <Button className="w-full" loading={start.isPending} disabled={!body.trim()} onClick={() => start.mutate()}>Send message</Button>
        </div>
      </Modal>
    </>
  );
}
