"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PlatformIcon } from "@/components/platform";
import { ButtonLink, Card, Empty, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { countdown, dateTime, taka } from "@/lib/format";
import type { Order } from "@/lib/types";

function Orders() {
  const sp = useSearchParams();
  const router = useRouter();
  const side = (sp.get("tab") as "buyer" | "seller") || "buyer";
  const q = useQuery({ queryKey: ["orders", side], queryFn: () => api<Order[]>(`/orders/?side=${side}`) });
  return (
    <>
      <PageHeader title="Orders & escrow" subtitle="Every purchase and sale with its escrow status." />
      <Tabs value={side} onChange={(v) => router.replace(`/dashboard/orders?tab=${v}`)} tabs={[{ value: "buyer", label: "Purchases" }, { value: "seller", label: "Sales" }]} />
      <div className="mt-5">
        {q.isLoading ? <Spinner /> : !q.data?.length ? (
          <Empty icon={ShoppingCart} title={side === "buyer" ? "No purchases yet" : "No sales yet"} action={<ButtonLink href={side === "buyer" ? "/marketplace" : "/dashboard/listings/new"}>{side === "buyer" ? "Browse marketplace" : "List an asset"}</ButtonLink>} />
        ) : (
          <Card className="divide-y divide-slate-100">
            {q.data.map((o) => (
              <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50 sm:flex-nowrap">
                <PlatformIcon category={o.listing.category} boxed className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{o.listing.title}</p>
                  <p className="text-xs text-ink-mute">
                    {o.code} · {dateTime(o.created_at)} · {side === "buyer" ? `seller @${o.seller.username}` : `buyer @${o.buyer.username}`}
                    {o.status === "protection" && ` · ${countdown(o.release_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                  <p className="font-bold">{taka(side === "seller" ? o.seller_net : o.amount)}</p>
                  <StatusBadge status={o.status} label={o.status_label} />
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Orders />
    </Suspense>
  );
}
