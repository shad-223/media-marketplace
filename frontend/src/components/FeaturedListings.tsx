"use client";

import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { api } from "@/lib/api";
import type { Listing, Page } from "@/lib/types";

import { ListingCard } from "./ListingCard";

/** Homepage "Featured" strip — renders nothing until an admin features a listing. */
export function FeaturedListings() {
  const q = useQuery({ queryKey: ["listings", "featured"], queryFn: () => api<Page<Listing>>("/listings/?featured=1") });
  const items = q.data?.results || [];
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-ink"><Star className="h-6 w-6 fill-amber-400 text-amber-400" /> Featured</h2>
        <p className="text-sm text-ink-soft">Hand-picked by the Media escrow team.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.slice(0, 8).map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>
    </section>
  );
}
