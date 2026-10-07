"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { BadgeCheck, Bookmark, DollarSign, Eye, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compact, taka } from "@/lib/format";
import type { Listing } from "@/lib/types";

import { PLATFORMS, PlatformIcon } from "./platform";

export function ListingCover({ listing, className }: { listing: Listing; className?: string }) {
  const p = PLATFORMS[listing.category] || PLATFORMS.website;
  if (listing.thumbnail)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={listing.thumbnail} alt="" className={clsx("w-full object-cover", className)} />;
  const Icon = p.icon;
  return (
    <div className={clsx("relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br", p.bg, className)}>
      <Icon className="h-14 w-14 text-white/90 drop-shadow" />
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-4 h-28 w-28 rounded-full bg-black/10" />
    </div>
  );
}

export function SaveButton({ listing, className }: { listing: Listing; className?: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(listing.is_saved);
  const m = useMutation({
    mutationFn: () => api<{ saved: boolean }>("/me/saved/", { body: { listing: listing.id } }),
    onSuccess: (d) => {
      setSaved(d.saved);
      qc.invalidateQueries({ queryKey: ["saved"] });
    },
  });
  return (
    <button
      aria-label={saved ? "Remove from saved" : "Save listing"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!me) return router.push("/login");
        m.mutate();
      }}
      className={clsx("rounded-full bg-white/90 p-2 shadow backdrop-blur transition hover:scale-105", className)}
    >
      <Bookmark className={clsx("h-4 w-4", saved ? "fill-brand-600 text-brand-600" : "text-ink-soft")} />
    </button>
  );
}

/** The card itself is a link, so the seller name navigates programmatically (no nested <a>). */
function SellerLink({ username, verified }: { username: string; verified: boolean }) {
  const router = useRouter();
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/u/${username}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/u/${username}`);
        }
      }}
      className="flex cursor-pointer items-center gap-1 text-ink-mute hover:text-brand-700 hover:underline"
    >
      @{username}
      {verified && <BadgeCheck className="h-3.5 w-3.5 text-brand-600" />}
    </span>
  );
}

export function ListingCard({ listing }: { listing: Listing }) {
  const p = PLATFORMS[listing.category] || PLATFORMS.website;
  const sold = listing.status === "sold";
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative">
        <ListingCover listing={listing} className="h-36" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink shadow">
          <PlatformIcon category={listing.category} className="h-3.5 w-3.5" /> {p.short}
        </div>
        {!sold && <SaveButton listing={listing} className="absolute right-3 top-3" />}
        {sold && <span className="absolute right-3 top-3 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">SOLD</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 min-h-[2.5rem] font-semibold leading-snug text-ink group-hover:text-brand-700">{listing.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          {listing.audience > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {compact(listing.audience)}
            </span>
          )}
          {listing.monthly_traffic > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {compact(listing.monthly_traffic)}/mo
            </span>
          )}
          {Number(listing.monthly_revenue) > 0 && (
            <span className="flex items-center gap-1 text-emerald-700">
              <TrendingUp className="h-3.5 w-3.5" /> {taka(listing.monthly_revenue)}/mo
            </span>
          )}
          {listing.monetized && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Monetized
            </span>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            <p className="text-xs text-ink-mute">Price</p>
            <p className="text-lg font-bold text-ink">{taka(listing.price)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            {listing.is_verified && (
              <span className="flex items-center gap-1 font-semibold text-emerald-700">
                <BadgeCheck className="h-4 w-4" /> Verified metrics
              </span>
            )}
            <SellerLink username={listing.seller.username} verified={listing.seller.is_verified} />
          </div>
        </div>
      </div>
    </Link>
  );
}
