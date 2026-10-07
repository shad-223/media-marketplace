"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { ExportButton } from "@/components/ExportButton";
import { FeatureRequestButton } from "@/components/FeatureRequestButton";
import { PlatformIcon } from "@/components/platform";
import { ButtonLink, Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { compact, taka } from "@/lib/format";
import type { Listing } from "@/lib/types";

type Row = {
  id: number; title: string; category: string; status: string; status_label: string; price: string;
  views: number; views_30d: number; series: number[]; saves: number; offers_total: number; offers_pending: number;
  best_offer: string | null; is_featured: boolean; featured_requested_at: string | null;
};
type Stats = {
  totals: { listings: number; live: number; views: number; views_30d: number; saves: number; offers_pending: number; sales: number; earned: string; pending_incoming: string };
  views_series: { date: string; views: number }[];
  earnings_by_month: { month: string; earned: string; sales: number }[];
  listings: Row[];
};

function Bars({ values, labels, format, tone = "bg-brand-500/80" }: { values: number[]; labels: string[]; format: (n: number) => string; tone?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-40 items-end gap-1">
      {values.map((v, i) => (
        <div key={labels[i]} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${labels[i]}: ${format(v)}`}>
          <div className={`w-full rounded-t ${tone} transition group-hover:opacity-80`} style={{ height: `${v ? Math.max(3, (v / max) * 100) : 1}%` }} />
        </div>
      ))}
    </div>
  );
}

/** 30-day mini sparkline for one listing. */
function Spark({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-6 w-24" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-brand-500" />
    </svg>
  );
}

export default function Analytics() {
  const q = useQuery({ queryKey: ["seller-stats"], queryFn: () => api<Stats>("/me/seller-stats/") });
  if (q.isLoading) return <Spinner />;
  const d = q.data;
  if (!d) return null;
  const t = d.totals;
  const kpis = [
    { label: "Earned (completed)", value: taka(t.earned, 2), tone: "text-emerald-700" },
    { label: "Incoming in escrow", value: taka(t.pending_incoming, 2), tone: "text-amber-700" },
    { label: "Completed sales", value: t.sales },
    { label: "Views (30 days)", value: compact(t.views_30d) },
    { label: "Total views", value: compact(t.views) },
    { label: "Saved by buyers", value: t.saves },
    { label: "Offers waiting", value: t.offers_pending },
    { label: "Live listings", value: `${t.live} / ${t.listings}` },
  ];
  const months = d.earnings_by_month;

  return (
    <>
      <PageHeader
        title="Seller analytics"
        subtitle="How your listings perform and what you've earned."
        action={<ExportButton path="/me/export/sales.csv" filename="media-sales.csv" label="Export sales" />}
      />
      {!d.listings.length ? (
        <Empty icon={BarChart3} title="No listings yet" text="List an asset to start seeing views, saves and offers here." action={<ButtonLink href="/dashboard/listings/new">List an asset</ButtonLink>} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label} className="p-4">
                <p className="text-xs text-ink-mute">{k.label}</p>
                <p className={`mt-1 text-lg font-extrabold sm:text-xl ${k.tone || "text-ink"}`}>{k.value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="min-w-0 p-5">
              <p className="mb-4 font-bold">Listing views — last 30 days</p>
              <Bars values={d.views_series.map((s) => s.views)} labels={d.views_series.map((s) => s.date)} format={(n) => `${n} views`} />
              <div className="mt-1 flex justify-between text-[10px] text-ink-mute"><span>{d.views_series[0]?.date.slice(5)}</span><span>today</span></div>
            </Card>
            <Card className="min-w-0 p-5">
              <p className="mb-4 font-bold">Earnings — last 12 months</p>
              <Bars values={months.map((m) => Number(m.earned))} labels={months.map((m) => m.month)} format={(n) => taka(n)} tone="bg-emerald-500/80" />
              <div className="mt-1 flex justify-between text-[10px] text-ink-mute"><span>{months[0]?.month}</span><span>{months[months.length - 1]?.month}</span></div>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-ink-mute">
                <tr>
                  <th className="px-5 py-3">Listing</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">30-day trend</th>
                  <th className="px-3 py-3 text-right">Views</th><th className="px-3 py-3 text-right">Saves</th><th className="px-3 py-3 text-right">Offers</th>
                  <th className="px-3 py-3 text-right">Best offer</th><th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.listings.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3">
                      <Link href={`/listings/${r.id}`} className="flex max-w-[260px] items-center gap-2 font-semibold hover:text-brand-700">
                        <PlatformIcon category={r.category} boxed className="h-7 w-7 shrink-0" /> <span className="truncate">{r.title}</span>
                      </Link>
                      <span className="text-xs text-ink-mute">{taka(r.price)}</span>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} label={r.status_label} /></td>
                    <td className="px-3 py-3"><Spark series={r.series} /></td>
                    <td className="px-3 py-3 text-right">{compact(r.views)}<span className="block text-[11px] text-ink-mute">{r.views_30d} / 30d</span></td>
                    <td className="px-3 py-3 text-right">{r.saves}</td>
                    <td className="px-3 py-3 text-right">{r.offers_total}{r.offers_pending ? <span className="block text-[11px] font-semibold text-brand-700">{r.offers_pending} waiting</span> : null}</td>
                    <td className="px-3 py-3 text-right">{r.best_offer ? taka(r.best_offer) : "—"}</td>
                    <td className="px-5 py-3 text-right"><FeatureRequestButton listing={r as unknown as Listing} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
