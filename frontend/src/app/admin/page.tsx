"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

import { AdminExportButton } from "@/components/AdminExportButton";
import { Card, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { taka } from "@/lib/format";

export default function AdminHome() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api("/admin/overview/") });
  const ledger = useQuery({ queryKey: ["ledger-check"], queryFn: () => api("/admin/ledger-check/") });
  if (q.isLoading) return <Spinner />;
  const d = q.data;
  const max = Math.max(1, ...d.series.map((s: any) => Number(s.gmv)));
  const kpis = [
    { label: "GMV (completed)", value: taka(d.gmv) },
    { label: "Platform revenue", value: taka(d.revenue, 2), tone: "text-emerald-700" },
    { label: "Held in escrow now", value: taka(d.escrow_held, 2), tone: "text-amber-700" },
    { label: "Completed trades", value: d.completed_trades },
    { label: "Open orders", value: d.open_orders },
    { label: "Orders today", value: d.today_orders },
    { label: "Users", value: `${d.users} (${d.verified_users} verified)` },
    { label: "Live listings", value: d.live_listings },
  ];
  const queues = [
    { href: "/admin/orders", label: "Open disputes", n: d.queues.disputes },
    { href: "/admin/listings", label: "Listings to review", n: d.queues.listings },
    { href: "/admin/kyc", label: "KYC to review", n: d.queues.kyc },
    { href: "/admin/withdrawals", label: "Withdrawals to pay", n: d.queues.withdrawals },
    { href: "/admin/deposits", label: "Deposits to verify", n: d.queues.deposits },
    { href: "/admin/reports", label: "Open reports", n: d.queues.reports ?? 0 },
    { href: "/admin/support", label: "Support tickets", n: d.queues.tickets ?? 0 },
    { href: "/admin/support?tab=deletions", label: "Deletion requests", n: d.queues.deletions ?? 0 },
  ];
  return (
    <>
      <PageHeader title="Platform analytics" subtitle="GMV, commissions, escrow exposure and work queues." action={<AdminExportButton kind="ledger" label="Export ledger" />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-ink-mute">{k.label}</p>
            <p className={`mt-1 text-lg font-extrabold sm:text-xl ${k.tone || "text-ink"}`}>{k.value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card className="p-5">
          <p className="mb-4 font-bold">Order value — last 14 days</p>
          <div className="flex h-48 items-end gap-1.5">
            {d.series.map((s: any) => (
              <div key={s.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${s.date}: ${s.orders} orders, ${taka(s.gmv)}`}>
                <div className="w-full rounded-t-md bg-brand-500/80 transition group-hover:bg-brand-600" style={{ height: `${Math.max(2, (Number(s.gmv) / max) * 100)}%` }} />
                <span className="mt-1 text-[9px] text-ink-mute">{s.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <p className="mb-3 font-bold">Work queues</p>
            <ul className="space-y-1">
              {queues.map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                    {x.label} <span className={`rounded-full px-2 text-xs font-bold ${x.n ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-ink-mute"}`}>{x.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <p className="mb-2 font-bold">Ledger integrity</p>
            {ledger.data && (ledger.data.balanced ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Double-entry ledger balanced</p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-rose-700"><XCircle className="h-5 w-5" /> Unbalanced transactions: {ledger.data.unbalanced_transactions.join(", ")}</p>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
