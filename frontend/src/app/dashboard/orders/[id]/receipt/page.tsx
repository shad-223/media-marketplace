"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button, ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, taka } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function Receipt({ params }: { params: { id: string } }) {
  const q = useQuery({ queryKey: ["order", params.id], queryFn: () => api<Order>(`/orders/${params.id}/`) });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const o = q.data;
  const rows: [string, string][] = [
    ["Order", o.code],
    ["Asset", `${o.listing.title} (${o.listing.category_label})`],
    ["Buyer", `@${o.buyer.username}`],
    ["Seller", `@${o.seller.username}`],
    ["Paid into escrow", dateTime(o.created_at)],
    ["Seller marked transferred", dateTime(o.transferred_at)],
    ["Buyer confirmed handover", dateTime(o.confirmed_at)],
    ["Protection window ends", dateTime(o.release_at)],
    ["Closed", dateTime(o.closed_at)],
  ];
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/dashboard/orders/${o.id}`} className="text-sm font-semibold text-brand-700">← Back to escrow room</Link>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / save PDF</Button>
      </div>
      <div className="media-receipt rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <p className="text-lg font-extrabold text-ink">Media</p>
              <p className="text-xs text-ink-mute">Escrow receipt</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-bold">{o.code}</p>
            <StatusBadge status={o.status} label={o.status_label} />
          </div>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between"><dt>Price</dt><dd className="font-semibold">{taka(o.amount, 2)}</dd></div>
          <div className="flex justify-between"><dt>Platform fee (paid by seller)</dt><dd>−{taka(o.fee, 2)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-bold"><dt>Seller receives</dt><dd>{taka(o.seller_net, 2)}</dd></div>
        </dl>
        <p className="mt-6 text-xs text-ink-mute">
          Funds were held by Media escrow and released only after the buyer confirmed the handover and the buyer-protection window ended.
          {o.status === "refunded" && " This order was refunded in full to the buyer."} Generated {dateTime(new Date().toISOString())}.
        </p>
      </div>
    </div>
  );
}
