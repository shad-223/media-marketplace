"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarDays, MailCheck, Star, Store } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { ListingCard } from "@/components/ListingCard";
import { PlatformIcon } from "@/components/platform";
import { Card, Empty, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Listing, Page } from "@/lib/types";

type Profile = {
  id: number;
  username: string;
  bio: string;
  avatar: string | null;
  is_verified: boolean;
  email_verified: boolean;
  rating: { average: number; count: number };
  completed_trades: number;
  date_joined: string;
  reviews: { id: number; reviewer: string; rating: number; comment: string; listing: string; category: string; created_at: string }[];
};

export default function PublicProfile({ params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username);
  const p = useQuery({ queryKey: ["profile", username], queryFn: () => api<Profile>(`/users/${encodeURIComponent(username)}/`), retry: false });
  const listings = useQuery({
    queryKey: ["listings", "seller", username],
    queryFn: () => api<Page<Listing>>(`/listings/?seller=${encodeURIComponent(username)}`),
    enabled: !!p.data,
  });

  if (p.isLoading) return <Spinner className="py-32" />;
  if (!p.data) return <div className="mx-auto max-w-xl px-4 py-24 text-center text-ink-soft">No trader called @{username}.</div>;
  const u = p.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar username={u.username} src={u.avatar} className="h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-ink">
              @{u.username}
              {u.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <BadgeCheck className="h-3.5 w-3.5" /> ID verified
                </span>
              )}
              {u.email_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                  <MailCheck className="h-3.5 w-3.5" /> Email verified
                </span>
              )}
            </h1>
            {u.bio && <p className="mt-1 text-sm text-ink-soft">{u.bio}</p>}
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-mute"><CalendarDays className="h-3.5 w-3.5" /> Member since {new Date(u.date_joined).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
          </div>
          <dl className="grid w-full grid-cols-3 gap-2 text-center sm:w-auto">
            <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-[11px] text-ink-mute">Rating</dt><dd className="font-bold">★ {u.rating.average || "—"}</dd></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-[11px] text-ink-mute">Reviews</dt><dd className="font-bold">{u.rating.count}</dd></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-[11px] text-ink-mute">Trades</dt><dd className="font-bold">{u.completed_trades}</dd></div>
          </dl>
        </div>
      </Card>

      <h2 className="mb-4 mt-10 text-xl font-bold text-ink">Live listings</h2>
      {listings.isLoading ? <Spinner /> : !listings.data?.results.length ? (
        <Empty icon={Store} title="No live listings right now" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{listings.data.results.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
      )}

      <h2 className="mb-4 mt-10 text-xl font-bold text-ink">Reviews</h2>
      {!u.reviews.length ? (
        <Empty icon={Star} title="No reviews yet" text="Reviews appear after completed escrow trades." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {u.reviews.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-current" : "opacity-25"}`} />)}
                </span>
                <span className="text-xs text-ink-mute">{ago(r.created_at)}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm text-ink">“{r.comment}”</p>}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-mute">
                <PlatformIcon category={r.category} className="h-3.5 w-3.5" /> {r.listing} · by @{r.reviewer}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
