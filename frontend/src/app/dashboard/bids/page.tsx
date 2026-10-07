"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PlatformIcon } from "@/components/platform";
import { Button, ButtonLink, Card, Empty, Field, Input, Modal, PageHeader, Spinner, StatusBadge, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, taka } from "@/lib/format";
import type { Offer } from "@/lib/types";

function Bids() {
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const tab = (sp.get("tab") as "mine" | "received") || "mine";
  const q = useQuery({ queryKey: ["offers", tab], queryFn: () => api<Offer[]>(`/offers/?side=${tab === "received" ? "seller" : "buyer"}`) });
  const act = useMutation({
    mutationFn: ({ id, action, ...extra }: { id: number; action: string; counter_amount?: string; message?: string }) =>
      api(`/offers/${id}/`, { body: { action, ...extra } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      setCounterFor(null);
    },
    onError: (e) => alert((e as Error).message),
  });
  const [counterFor, setCounterFor] = useState<Offer | null>(null);
  const [counter, setCounter] = useState({ amount: "", message: "" });

  return (
    <>
      <PageHeader title="Bids & offers" subtitle="Offers you’ve made, and offers buyers sent on your listings." />
      <Tabs value={tab} onChange={(v) => router.replace(`/dashboard/bids?tab=${v}`)} tabs={[{ value: "mine", label: "My bids" }, { value: "received", label: "Received" }]} />
      <div className="mt-5">
        {q.isLoading ? <Spinner /> : !q.data?.length ? (
          <Empty icon={Gavel} title={tab === "mine" ? "No bids yet" : "No offers received"} text={tab === "mine" ? "Use “Make an offer” on any listing that accepts offers." : undefined} />
        ) : (
          <div className="space-y-3">
            {q.data.map((o) => (
              <Card key={o.id} className="flex flex-wrap items-center gap-3 p-4">
                <PlatformIcon category={o.listing.category} boxed className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link href={`/listings/${o.listing.id}`} className="block truncate font-semibold hover:text-brand-700">{o.listing.title}</Link>
                  <p className="text-xs text-ink-mute">
                    Asking {taka(o.listing.price)} · {tab === "received" ? `from @${o.buyer.username}` : `seller @${o.listing.seller.username}`} · {ago(o.created_at)}
                  </p>
                  {o.message && <p className="mt-1 text-sm text-ink-soft">“{o.message}”</p>}
                  {o.counter_amount && (
                    <p className="mt-1 text-sm text-brand-700">
                      Seller counter: <b>{taka(o.counter_amount)}</b>{o.counter_message ? ` — “${o.counter_message}”` : ""}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{taka(o.counter_amount && o.status !== "rejected" ? o.counter_amount : o.amount)}</p>
                  <StatusBadge status={o.status === "countered" ? "transferred" : o.status} label={o.status_label} />
                </div>
                <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                  {tab === "received" && o.status === "pending" && (
                    <>
                      <Button size="sm" variant="success" loading={act.isPending} onClick={() => act.mutate({ id: o.id, action: "accept" })}>Accept</Button>
                      <Button size="sm" variant="secondary" onClick={() => { setCounter({ amount: "", message: "" }); setCounterFor(o); }}>Counter</Button>
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: o.id, action: "reject" })}>Reject</Button>
                    </>
                  )}
                  {tab === "received" && o.status === "countered" && <span className="text-xs text-ink-mute">Waiting for buyer</span>}
                  {tab === "mine" && o.status === "countered" && (
                    <>
                      <Button size="sm" variant="success" loading={act.isPending} onClick={() => act.mutate({ id: o.id, action: "accept_counter" })}>Accept {taka(o.counter_amount)}</Button>
                      <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: o.id, action: "decline_counter" })}>Decline</Button>
                    </>
                  )}
                  {tab === "mine" && o.status === "accepted" && <ButtonLink size="sm" href={`/listings/${o.listing.id}`}>Pay now</ButtonLink>}
                  {tab === "mine" && ["pending", "accepted"].includes(o.status) && (
                    <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: o.id, action: "withdraw" })}>Withdraw</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!counterFor} onClose={() => setCounterFor(null)} title="Send a counter-offer">
        {counterFor && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate({ id: counterFor.id, action: "counter", counter_amount: counter.amount, message: counter.message }); }}>
            <p className="text-sm text-ink-soft">@{counterFor.buyer.username} offered <b>{taka(counterFor.amount)}</b> · your asking price is <b>{taka(counterFor.listing.price)}</b>.</p>
            <Field label="Your counter (৳)" hint="Between their offer and your asking price">
              <Input inputMode="decimal" value={counter.amount} onChange={(e) => setCounter({ ...counter, amount: e.target.value })} required />
            </Field>
            <Field label="Message (optional)"><Textarea value={counter.message} onChange={(e) => setCounter({ ...counter, message: e.target.value })} /></Field>
            <Button className="w-full" loading={act.isPending}>Send counter</Button>
          </form>
        )}
      </Modal>
    </>
  );
}

export default function BidsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Bids />
    </Suspense>
  );
}
