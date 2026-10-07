"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PlatformIcon } from "@/components/platform";
import { Button, ButtonLink, Card, Empty, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui";
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
    mutationFn: ({ id, action }: { id: number; action: string }) => api(`/offers/${id}/`, { body: { action } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (e) => alert((e as Error).message),
  });

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
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{taka(o.amount)}</p>
                  <StatusBadge status={o.status} label={o.status_label} />
                </div>
                <div className="flex w-full justify-end gap-2 sm:w-auto">
                  {tab === "received" && o.status === "pending" && (
                    <>
                      <Button size="sm" variant="success" loading={act.isPending} onClick={() => act.mutate({ id: o.id, action: "accept" })}>Accept</Button>
                      <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: o.id, action: "reject" })}>Reject</Button>
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
