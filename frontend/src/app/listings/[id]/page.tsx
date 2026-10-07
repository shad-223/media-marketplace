"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, ExternalLink, Eye, Globe2, Lock, ShieldCheck, Star, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { ListingCover, SaveButton } from "@/components/ListingCard";
import { ListingGallery } from "@/components/ListingGallery";
import { MessageSellerButton } from "@/components/MessageSellerButton";
import { RecordView } from "@/components/RecentlyViewed";
import { PLATFORMS, PlatformIcon } from "@/components/platform";
import { Badge, Button, ButtonLink, Card, ErrorNote, Field, Input, Modal, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { ago, compact, taka, usd } from "@/lib/format";
import type { Listing } from "@/lib/types";

export default function ListingPage({ params }: { params: { id: string } }) {
  const { me } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["listing", params.id], queryFn: () => api<Listing & { seller_reviews: any[]; my_offer: any }>(`/listings/${params.id}/`) });
  const cfg = useConfig();
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api("/wallet/summary/"), enabled: !!me });
  const [buyOpen, setBuyOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  const buy = useMutation({
    mutationFn: (offer?: number) => api("/orders/", { body: { listing: Number(params.id), offer } }),
    onSuccess: (o) => {
      qc.invalidateQueries();
      router.push(`/dashboard/orders/${o.id}`);
    },
  });
  const offer = useMutation({
    mutationFn: () => api("/offers/", { body: { listing: Number(params.id), amount, message: msg } }),
    onSuccess: () => {
      setOfferOpen(false);
      qc.invalidateQueries({ queryKey: ["listing", params.id] });
    },
  });

  if (q.isLoading) return <Spinner className="py-32" />;
  if (q.error || !q.data) return <div className="mx-auto max-w-xl px-4 py-24 text-center text-ink-soft">This listing doesn’t exist or isn’t public.</div>;
  const l = q.data;
  const p = PLATFORMS[l.category] || PLATFORMS.website;
  const mine = me && me.id === l.seller.id;
  const available = l.status === "approved";
  const needLogin = () => router.push(`/login?next=/listings/${l.id}`);
  const balance = Number(summary.data?.available || 0);
  const myOffer = l.my_offer;

  const metrics = [
    { icon: Users, label: p.metric, value: l.audience ? compact(l.audience) : "—" },
    { icon: Eye, label: "Monthly traffic", value: l.monthly_traffic ? compact(l.monthly_traffic) : "—" },
    { icon: TrendingUp, label: "Monthly revenue", value: Number(l.monthly_revenue) ? taka(l.monthly_revenue) : "—" },
    { icon: CalendarClock, label: "Age", value: l.age_months ? `${Math.floor(l.age_months / 12)}y ${l.age_months % 12}m` : "—" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <RecordView id={l.id} />
      <nav className="mb-4 text-sm text-ink-mute">
        <Link href="/marketplace">Marketplace</Link> / <Link href={`/marketplace?category=${l.category}`}>{p.short}</Link>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="relative overflow-hidden rounded-3xl">
            <ListingCover listing={l} className="h-56 sm:h-72" />
            {available && <SaveButton listing={l} className="absolute right-4 top-4" />}
          </div>
          <ListingGallery images={l.images} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand"><PlatformIcon category={l.category} className="h-3.5 w-3.5" /> {l.category_label}</Badge>
              {l.is_verified && <Badge tone="green"><BadgeCheck className="h-3.5 w-3.5" /> Verified metrics</Badge>}
              {l.ownership_found && <Badge tone="green"><ShieldCheck className="h-3.5 w-3.5" /> Ownership verified</Badge>}
              {l.monetized && <Badge tone="blue">Monetized</Badge>}
              {l.status !== "approved" && <StatusBadge status={l.status} label={l.status_label} />}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{l.title}</h1>
            <p className="mt-1 text-sm text-ink-mute">{[l.niche, l.country].filter(Boolean).join(" · ")} · listed {ago(l.approved_at || l.created_at)} · {l.views} views</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((m) => (
              <Card key={m.label} className="p-4">
                <m.icon className="h-5 w-5 text-brand-600" />
                <p className="mt-2 text-lg font-bold text-ink">{m.value}</p>
                <p className="text-xs text-ink-mute">{m.label}</p>
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <h2 className="mb-3 font-bold text-ink">About this asset</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{l.description}</p>
            {l.asset_url && (
              <a href={l.asset_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                <Globe2 className="h-4 w-4" /> View public page <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="mb-4 font-bold text-ink">Seller</h2>
            <div className="flex items-center gap-3">
              <Link href={`/u/${l.seller.username}`}>
                <Avatar username={l.seller.username} src={l.seller.avatar} className="h-12 w-12" />
              </Link>
              <div>
                <Link href={`/u/${l.seller.username}`} className="flex items-center gap-1 font-semibold text-ink hover:text-brand-700">
                  @{l.seller.username} {l.seller.is_verified && <BadgeCheck className="h-4 w-4 text-brand-600" />}
                </Link>
                <p className="text-xs text-ink-mute">
                  ★ {l.seller.rating?.average || "—"} ({l.seller.rating?.count || 0} reviews) · {l.seller.completed_trades} trades · joined {ago(l.seller.date_joined)}
                </p>
              </div>
            </div>
            {l.seller_reviews.length > 0 && (
              <ul className="mt-4 space-y-3">
                {l.seller_reviews.map((r) => (
                  <li key={r.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <span className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
                    </span>
                    <p className="mt-1 text-ink">{r.comment}</p>
                    <p className="text-xs text-ink-mute">@{r.reviewer.username} · {ago(r.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <p className="text-sm text-ink-mute">Asking price</p>
            <p className="text-3xl font-extrabold text-ink">{taka(l.price)}</p>
            <p className="text-xs text-ink-mute">≈ {usd(l.price, Number(cfg.data?.usd_rate || 122))} USD</p>
            <div className="mt-5 space-y-2">
              {mine ? (
                <ButtonLink href="/dashboard/listings" variant="secondary" className="w-full">Manage your listing</ButtonLink>
              ) : !available ? (
                <p className="rounded-xl bg-slate-100 p-3 text-center text-sm font-semibold text-ink-soft">{l.status === "sold" ? "This asset has been sold" : "Currently in escrow with another buyer"}</p>
              ) : myOffer?.status === "accepted" ? (
                <>
                  <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Your offer of <b>{taka(myOffer.counter_amount || myOffer.amount)}</b> was accepted.</p>
                  <Button size="lg" className="w-full" onClick={() => setBuyOpen(true)}>Pay {taka(myOffer.counter_amount || myOffer.amount)} into escrow</Button>
                </>
              ) : (
                <>
                  {myOffer?.status === "countered" && (
                    <ButtonLink href="/dashboard/bids" variant="secondary" className="w-full">Seller countered at {taka(myOffer.counter_amount)} — respond</ButtonLink>
                  )}
                  <Button size="lg" className="w-full" onClick={() => (me ? setBuyOpen(true) : needLogin())}>Buy now</Button>
                  {l.allow_offers && (
                    <Button size="lg" variant="secondary" className="w-full" onClick={() => (me ? setOfferOpen(true) : needLogin())}>
                      {myOffer?.status === "pending" ? `Offer sent: ${taka(myOffer.amount)} — update` : "Make an offer"}
                    </Button>
                  )}
                </>
              )}
              {!mine && <MessageSellerButton listingId={l.id} sellerId={l.seller.id} title={l.title} />}
            </div>
            <ul className="mt-6 space-y-2.5 text-sm text-ink-soft">
              <li className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" /> Money held in escrow until you confirm ownership</li>
              <li className="flex gap-2"><Lock className="h-5 w-5 shrink-0 text-emerald-600" /> {cfg.data?.buyer_protection_hours ?? 72}-hour buyer protection after handover</li>
              <li className="flex gap-2"><BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600" /> Listing reviewed by the Media escrow team</li>
            </ul>
          </Card>
        </aside>
      </div>

      <Modal open={buyOpen} onClose={() => setBuyOpen(false)} title="Pay into escrow">
        {(() => {
          const price = myOffer?.status === "accepted" ? Number(myOffer.counter_amount || myOffer.amount) : Number(l.price);
          const short = balance < price;
          return (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between"><span className="text-ink-soft">Asset</span><span className="max-w-[60%] truncate font-semibold">{l.title}</span></div>
                <div className="mt-2 flex justify-between"><span className="text-ink-soft">Amount to lock</span><span className="font-bold">{taka(price, 2)}</span></div>
                <div className="mt-2 flex justify-between"><span className="text-ink-soft">Your available balance</span><span className={short ? "font-semibold text-rose-600" : "font-semibold"}>{taka(balance, 2)}</span></div>
              </div>
              <p className="text-xs text-ink-mute">The seller is paid only after you confirm the handover and the {cfg.data?.buyer_protection_hours ?? 72}-hour protection window passes. Buyer pays no fee.</p>
              {short ? (
                <ButtonLink href="/dashboard/wallet" className="w-full">Add ৳{(price - balance).toLocaleString("en-IN")} to your wallet</ButtonLink>
              ) : (
                <Button className="w-full" size="lg" loading={buy.isPending} onClick={() => buy.mutate(myOffer?.status === "accepted" ? myOffer.id : undefined)}>
                  Confirm & lock {taka(price)}
                </Button>
              )}
              <ErrorNote error={buy.error} />
            </div>
          );
        })()}
      </Modal>

      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title="Make an offer">
        <div className="space-y-4">
          <Field label="Your offer (৳)" hint={`Asking ${taka(l.price)} · offers must be at least 30% of it`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200000" />
          </Field>
          <Field label="Message to seller (optional)">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Why this price? Any questions?" />
          </Field>
          <Button className="w-full" loading={offer.isPending} onClick={() => offer.mutate()}>Send offer</Button>
          <ErrorNote error={offer.error} />
        </div>
      </Modal>
    </div>
  );
}
