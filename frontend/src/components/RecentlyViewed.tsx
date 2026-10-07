"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { taka } from "@/lib/format";
import type { Listing } from "@/lib/types";

import { PlatformIcon } from "./platform";

const KEY = "media.recent";
const MAX = 12;

function read(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Drop into a listing page: remembers the id (newest first) in this browser only. */
export function RecordView({ id }: { id: number }) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([id, ...read().filter((x) => x !== id)].slice(0, MAX)));
    } catch {}
  }, [id]);
  return null;
}

/** Horizontal strip of the listings this browser opened recently. Renders nothing if there are none. */
export function RecentlyViewed({ className }: { className?: string }) {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => setIds(read()), []);
  const q = useQuery({
    queryKey: ["recent", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const out = await Promise.all(ids.map((id) => api<Listing>(`/listings/${id}/?peek=1`).catch(() => null)));
      return out.filter(Boolean) as Listing[];
    },
    staleTime: 60_000,
  });
  if (!ids.length || !q.data?.length) return null;
  return (
    <div className={className}>
      <p className="mb-2 text-sm font-bold text-ink">Recently viewed</p>
      <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {q.data.map((l) => (
          <Link key={l.id} href={`/listings/${l.id}`} className="flex w-56 shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 hover:border-brand-300">
            <PlatformIcon category={l.category} boxed className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{l.title}</p>
              <p className="text-xs text-ink-mute">{l.status === "approved" ? taka(l.price) : l.status === "sold" ? "Sold" : "In escrow"}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
