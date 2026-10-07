"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Lock, MessagesSquare, Search, ShieldCheck, Star, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ListingCard } from "@/components/ListingCard";
import { GROUPS, PLATFORMS, PlatformIcon } from "@/components/platform";
import { ButtonLink, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { ago, compact, taka } from "@/lib/format";
import type { Listing, Page } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api("/stats/") });
  const hours = useConfig().data?.buyer_protection_hours ?? 72;
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<any[]>("/categories/") });
  const fresh = useQuery({ queryKey: ["listings", "home"], queryFn: () => api<Page<Listing>>("/listings/?sort=newest") });
  const activity = useQuery({ queryKey: ["activity"], queryFn: () => api("/listings/activity/") });

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("category", cat);
    router.push(`/marketplace?${p}`);
  };

  return (
    <>
      {/* Hero */}
      <section className="hero-mesh relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" /> Escrow-protected digital asset marketplace
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-6xl">
              Buy & sell channels, sites and apps <span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent">without the risk</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-ink-soft sm:text-lg">
              Your money waits safely in escrow until you own the asset. Verified sellers, verified numbers, and payment by bKash, Nagad, Rocket, bank or card.
            </p>
          </div>

          <form onSubmit={go} className="mx-auto mt-8 flex max-w-3xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-brand-900/5 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “cooking channel” or “tech blog”" className="h-12 w-full rounded-xl pl-10 pr-3 text-sm focus:outline-none" />
            </div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm sm:w-52">
              <option value="">All categories</option>
              {Object.entries(PLATFORMS).map(([v, p]) => (
                <option key={v} value={v}>{p.label}</option>
              ))}
            </select>
            <button className="h-12 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700">Search</button>
          </form>

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Volume traded", value: stats.data ? taka(stats.data.volume_traded) : "—" },
              { label: "Active users", value: stats.data ? compact(stats.data.active_users) : "—" },
              { label: "Listed assets", value: stats.data ? compact(stats.data.listed_assets) : "—" },
              { label: "Completed trades", value: stats.data ? compact(stats.data.completed_trades) : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white bg-white/70 px-4 py-4 text-center shadow-sm backdrop-blur">
                <p className="text-xl font-extrabold text-ink sm:text-2xl">{s.value}</p>
                <p className="mt-0.5 text-xs font-medium text-ink-mute">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-ink">Browse by platform</h2>
            <p className="text-sm text-ink-soft">13 asset types across social, web, gaming and SaaS.</p>
          </div>
          <Link href="/marketplace" className="hidden items-center gap-1 text-sm font-semibold text-brand-700 sm:flex">
            All listings <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {GROUPS.map((g) => (
          <div key={g.value} className="mb-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">{g.label}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(cats.data || []).filter((c) => c.group === g.value).map((c) => (
                <Link key={c.value} href={`/marketplace?category=${c.value}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-md">
                  <PlatformIcon category={c.value} boxed className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{PLATFORMS[c.value]?.short}</p>
                    <p className="text-xs text-ink-mute">{c.count} listed</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* New listings */}
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-ink">New on the marketplace</h2>
            <p className="text-sm text-ink-soft">Every listing is reviewed by our escrow team before it goes live.</p>
          </div>
          <ButtonLink href="/marketplace" variant="secondary" size="sm">View all</ButtonLink>
        </div>
        {fresh.isLoading ? <Spinner /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fresh.data?.results.slice(0, 8).map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </section>

      {/* How escrow works */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="rounded-3xl bg-ink px-6 py-12 text-white sm:px-12">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">How Media escrow protects you</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Wallet, t: "1. Buyer pays into escrow", d: "Funds are locked by Media — the seller can see the money is there but can't touch it." },
              { icon: MessagesSquare, t: "2. 3-way handover room", d: "Buyer, seller and an escrow agent share one private chat for the transfer." },
              { icon: BadgeCheck, t: "3. Buyer confirms ownership", d: "Only after you verify full control do you confirm the handover with an OTP." },
              { icon: Lock, t: `4. ${hours}-hour protection`, d: `Funds release to the seller after ${hours} hours — time to catch any recovery attempt.` },
            ].map((s) => (
              <div key={s.t} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <s.icon className="h-7 w-7 text-brand-300" />
                <p className="mt-3 font-semibold">{s.t}</p>
                <p className="mt-1 text-sm text-white/70">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <ButtonLink href="/tutorial" variant="secondary">Read the full guide</ButtonLink>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 font-bold text-ink">Recently sold</h3>
          {!activity.data?.sold?.length ? <p className="text-sm text-ink-mute">No sales yet — be the first.</p> : (
            <ul className="divide-y divide-slate-100">
              {activity.data.sold.map((l: Listing) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <PlatformIcon category={l.category} boxed className="h-9 w-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{l.title}</p>
                    <p className="text-xs text-ink-mute">{l.category_label}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{taka(l.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="mb-4 font-bold text-ink">What traders say</h3>
          {!activity.data?.reviews?.length ? <p className="text-sm text-ink-mute">Reviews appear after completed trades.</p> : (
            <ul className="space-y-4">
              {activity.data.reviews.map((r: any) => (
                <li key={r.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-current" : "opacity-25"}`} />)}
                  </div>
                  <p className="mt-2 text-sm text-ink">“{r.comment || "Great trade."}”</p>
                  <p className="mt-1 text-xs text-ink-mute">@{r.reviewer.username} about @{r.reviewee} · {ago(r.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
