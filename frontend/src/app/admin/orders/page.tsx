"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PlatformIcon } from "@/components/platform";
import { AdminExportButton } from "@/components/AdminExportButton";
import { Card, Empty, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { countdown, dateTime, taka } from "@/lib/format";
import type { Order } from "@/lib/types";

function OrderLine({ o }: { o: Order }) {
  return (
    <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50 sm:flex-nowrap">
      <PlatformIcon category={o.listing.category} boxed className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{o.listing.title}</p>
        <p className="text-xs text-ink-mute">{o.code} · @{o.buyer.username} → @{o.seller.username} · {dateTime(o.created_at)}{o.status === "protection" ? ` · ${countdown(o.release_at)}` : ""}</p>
      </div>
      <span className="font-bold">{taka(o.amount)}</span>
      <StatusBadge status={o.status} label={o.status_label} />
    </Link>
  );
}

export default function AdminOrders() {
  const [tab, setTab] = useState("disputes");
  const disputes = useQuery({ queryKey: ["admin-disputes"], queryFn: () => api<any[]>("/admin/disputes/?status=open"), enabled: tab === "disputes" });
  const orders = useQuery({ queryKey: ["admin-orders", tab], queryFn: () => api(`/admin/orders/?status=${tab}`), enabled: tab !== "disputes" });
  const list: Order[] = orders.data?.results || [];
  return (
    <>
      <PageHeader title="Escrow & disputes" subtitle="Monitor every handover room, resolve disputes, release or refund." action={<AdminExportButton kind="orders" />} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "disputes", label: "Open disputes", count: disputes.data?.length }, { value: "open", label: "Active escrow" }, { value: "completed", label: "Completed" }, { value: "refunded", label: "Refunded" }]} />
      <div className="mt-5">
        {tab === "disputes" ? (
          disputes.isLoading ? <Spinner /> : !disputes.data?.length ? <Empty icon={AlertTriangle} title="No open disputes" /> : (
            <div className="space-y-3">
              {disputes.data.map((d) => (
                <Card key={d.id} className="overflow-hidden">
                  <OrderLine o={d.order} />
                  <p className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900"><b>@{d.opened_by}:</b> {d.reason} <span className="text-xs text-rose-700/70">· {dateTime(d.created_at)}</span></p>
                </Card>
              ))}
            </div>
          )
        ) : orders.isLoading ? <Spinner /> : !list.length ? <Empty title="No orders here" /> : (
          <Card className="divide-y divide-slate-100">{list.map((o) => <OrderLine key={o.id} o={o} />)}</Card>
        )}
      </div>
    </>
  );
}
