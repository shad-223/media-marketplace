"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, BadgeCheck, Bookmark, Gavel, IdCard, LayoutList, ReceiptText, ShieldCheck, ShoppingBag, Store } from "lucide-react";
import Link from "next/link";

import { PlatformIcon } from "@/components/platform";
import { ButtonLink, Card, Empty, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, taka } from "@/lib/format";
import type { Listing, Order, Page } from "@/lib/types";

function OrderRow({ o, side }: { o: Order; side: "buyer" | "seller" }) {
  return (
    <Link href={`/dashboard/orders/${o.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50">
      <PlatformIcon category={o.listing.category} boxed className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{o.listing.title}</p>
        <p className="text-xs text-ink-mute">{o.code} · {side === "buyer" ? `from @${o.seller.username}` : `to @${o.buyer.username}`}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold">{taka(o.amount)}</p>
        <StatusBadge status={o.status} label={o.status_label.split(" — ")[0]} />
      </div>
    </Link>
  );
}

export default function Overview() {
  const { me } = useAuth();
  const s = useQuery({ queryKey: ["summary"], queryFn: () => api("/wallet/summary/") });
  const buying = useQuery({ queryKey: ["orders", "buyer", "open"], queryFn: () => api<Order[]>("/orders/?side=buyer&open=1") });
  const selling = useQuery({ queryKey: ["orders", "seller", "open"], queryFn: () => api<Order[]>("/orders/?side=seller&open=1") });
  const saved = useQuery({ queryKey: ["saved"], queryFn: () => api<Listing[]>("/me/saved/") });
  const fresh = useQuery({ queryKey: ["listings", "dash"], queryFn: () => api<Page<Listing>>("/listings/?sort=newest") });
  const d = s.data || {};

  const metrics = [
    { label: "Available balance", value: taka(d.available, 2), note: "Ready to withdraw", tone: "text-emerald-700" },
    { label: "Pending balance", value: taka(d.pending, 2), note: "Locked in active escrow", tone: "text-amber-700" },
    { label: "Active purchases", value: d.active_purchases ?? "—", note: "In escrow" },
    { label: "Active sales", value: d.active_sales ?? "—", note: `${d.active_listings ?? 0} live listings` },
  ];
  const actions = [
    { href: "/marketplace", label: "Browse marketplace", icon: Store },
    { href: "/dashboard/listings", label: "My listings", icon: LayoutList },
    { href: "/dashboard/transactions", label: "Transactions", icon: ReceiptText },
    { href: "/dashboard/wallet", label: "Withdraw", icon: ArrowDownToLine },
    { href: "/dashboard/bids", label: "My bids", icon: Gavel },
    { href: "/dashboard/saved", label: "Saved listings", icon: Bookmark },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Hi, {me?.username}! 👋</h1>
          <p className="text-sm text-ink-soft">Your buying & selling overview</p>
        </div>
        <ButtonLink href="/dashboard/listings/new">+ Sell an asset</ButtonLink>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-mute">{m.label}</p>
            <p className={`mt-1 text-xl font-extrabold sm:text-2xl ${m.tone || "text-ink"}`}>{m.value}</p>
            <p className="mt-0.5 text-xs text-ink-mute">{m.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-bold text-ink"><ShoppingBag className="h-4 w-4 text-brand-600" /> Buying</h2>
                <Link href="/dashboard/orders" className="text-xs font-semibold text-brand-700">All</Link>
              </div>
              {buying.data?.length ? buying.data.slice(0, 4).map((o) => <OrderRow key={o.id} o={o} side="buyer" />) : <p className="py-6 text-center text-sm text-ink-mute">No active purchases.</p>}
            </Card>
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-bold text-ink"><Store className="h-4 w-4 text-emerald-600" /> Selling</h2>
                <Link href="/dashboard/orders?tab=seller" className="text-xs font-semibold text-brand-700">All</Link>
              </div>
              {selling.data?.length ? selling.data.slice(0, 4).map((o) => <OrderRow key={o.id} o={o} side="seller" />) : (
                <p className="py-6 text-center text-sm text-ink-mute">No active sales. {d.offers_received ? <Link className="font-semibold text-brand-700" href="/dashboard/bids?tab=received">{d.offers_received} offer(s) waiting</Link> : null}</p>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-ink"><Bookmark className="h-4 w-4 text-brand-600" /> Saved listings</h2>
              <Link href="/dashboard/saved" className="text-xs font-semibold text-brand-700">All</Link>
            </div>
            {saved.data?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {saved.data.slice(0, 4).map((l) => (
                  <Link key={l.id} href={`/listings/${l.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
                    <PlatformIcon category={l.category} boxed className="h-9 w-9 shrink-0" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.title}</p><p className="text-xs text-ink-mute">{taka(l.price)}</p></div>
                  </Link>
                ))}
              </div>
            ) : <p className="py-4 text-center text-sm text-ink-mute">Tap the bookmark on any listing to save it here.</p>}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-ink">New on marketplace</h2>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live</span>
            </div>
            {!fresh.data?.results.length ? <Empty title="Nothing new yet" /> : (
              <ul className="divide-y divide-slate-100">
                {fresh.data.results.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <PlatformIcon category={l.category} boxed className="h-9 w-9 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/listings/${l.id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand-700">{l.title}</Link>
                      <p className="text-xs text-ink-mute">{l.category_label} · {ago(l.approved_at)}</p>
                    </div>
                    <span className="hidden text-sm font-bold sm:block">{taka(l.price)}</span>
                    <ButtonLink href={`/listings/${l.id}`} size="sm">Buy now</ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-ink">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((a) => (
                <Link key={a.href + a.label} href={a.href} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 p-3 text-center text-xs font-semibold text-ink hover:border-brand-300 hover:bg-brand-50">
                  <a.icon className="h-5 w-5 text-brand-600" /> {a.label}
                </Link>
              ))}
            </div>
          </Card>

          {me && !me.is_verified && (
            <Card className="border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
              <IdCard className="h-8 w-8 text-brand-600" />
              <p className="mt-2 font-bold text-ink">{me.kyc_status === "pending" ? "Verification in review" : "Get verified"}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {me.kyc_status === "pending" ? "We’ll notify you once an agent checks your document." : "Upload your NID, passport or driving licence to earn the Verified badge and remove trade limits."}
              </p>
              {me.kyc_status !== "pending" && <ButtonLink href="/dashboard/kyc" size="sm" className="mt-3">Verify identity</ButtonLink>}
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold uppercase text-brand-700">{me?.username.slice(0, 2)}</div>
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate font-semibold text-ink">@{me?.username} {me?.is_verified && <BadgeCheck className="h-4 w-4 text-brand-600" />}</p>
                <p className="text-xs text-ink-mute">{me?.is_verified ? "Verified" : "Not verified"} · joined {ago(me?.date_joined)}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2"><dt className="text-[11px] text-ink-mute">Rating</dt><dd className="font-bold">★ {me?.rating.average || "—"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-2"><dt className="text-[11px] text-ink-mute">Trades</dt><dd className="font-bold">{d.completed_trades ?? 0}</dd></div>
              <div className="rounded-xl bg-slate-50 p-2"><dt className="text-[11px] text-ink-mute">Volume</dt><dd className="truncate font-bold">{taka(d.trade_volume)}</dd></div>
            </dl>
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-mute"><ShieldCheck className="h-4 w-4 text-emerald-600" /> All your trades are escrow-protected.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
