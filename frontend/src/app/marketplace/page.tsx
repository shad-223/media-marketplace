"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { SlidersHorizontal, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ListingCard } from "@/components/ListingCard";
import { GROUP_OF, GROUPS, PLATFORMS, PlatformIcon } from "@/components/platform";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { Button, Empty, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Listing, Page } from "@/lib/types";

function Marketplace() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [showFilters, setShowFilters] = useState(false);
  const qs = sp.toString();
  const page = Number(sp.get("page") || 1);
  const data = useQuery({ queryKey: ["listings", qs], queryFn: () => api<Page<Listing>>(`/listings/?${qs}`) });

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== "page") p.delete("page");
    router.push(`${path}?${p}`, { scroll: false });
  };
  const category = sp.get("category") || "";
  const group = sp.get("group") || "";

  const filters = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">Platform</p>
        <button onClick={() => (set("category", null), set("group", null))} className={clsx("mb-1 w-full rounded-lg px-3 py-2 text-left text-sm", !category && !group ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-soft hover:bg-slate-50")}>
          All assets
        </button>
        {GROUPS.map((g) => (
          <div key={g.value} className="mb-2">
            <button onClick={() => { const p = new URLSearchParams(sp); p.delete("category"); p.set("group", g.value); p.delete("page"); router.push(`${path}?${p}`); }} className={clsx("w-full rounded-lg px-3 py-1.5 text-left text-xs font-bold uppercase", group === g.value && !category ? "text-brand-700" : "text-ink-mute")}>
              {g.label}
            </button>
            {Object.entries(PLATFORMS).filter(([v]) => GROUP_OF[v] === g.value).map(([v, p]) => (
              <button key={v} onClick={() => { const n = new URLSearchParams(sp); n.delete("group"); n.set("category", v); n.delete("page"); router.push(`${path}?${n}`); }} className={clsx("flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm", category === v ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-soft hover:bg-slate-50")}>
                <PlatformIcon category={v} /> {p.short}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">Price (৳)</p>
        <div className="flex gap-2">
          <Input placeholder="Min" inputMode="numeric" defaultValue={sp.get("min_price") || ""} onBlur={(e) => set("min_price", e.target.value)} />
          <Input placeholder="Max" inputMode="numeric" defaultValue={sp.get("max_price") || ""} onBlur={(e) => set("max_price", e.target.value)} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">Minimum audience</p>
        <Select value={sp.get("min_audience") || ""} onChange={(e) => set("min_audience", e.target.value)}>
          <option value="">Any</option>
          <option value="10000">10K+</option>
          <option value="100000">100K+</option>
          <option value="500000">500K+</option>
          <option value="1000000">1M+</option>
        </Select>
      </div>
      <div className="space-y-2">
        {[["verified", "Verified metrics only"], ["monetized", "Monetized only"]].map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!sp.get(k)} onChange={(e) => set(k, e.target.checked ? "1" : null)} /> {l}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Marketplace</h1>
          <p className="text-sm text-ink-soft">{data.data ? `${data.data.count} assets for sale` : "Loading…"}{sp.get("q") ? ` matching “${sp.get("q")}”` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SaveSearchButton />
          <Button variant="secondary" className="lg:hidden" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>
          <Select value={sp.get("sort") || "newest"} onChange={(e) => set("sort", e.target.value)} className="w-44">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="audience">Largest audience</option>
            <option value="revenue">Highest revenue</option>
          </Select>
        </div>
      </div>
      <RecentlyViewed className="mb-6" />
      <div className="flex gap-8">
        <aside className={clsx("w-60 shrink-0", showFilters ? "fixed inset-0 z-50 w-full overflow-y-auto bg-white p-5" : "hidden lg:block")}>
          {showFilters && (
            <div className="mb-4 flex justify-between">
              <p className="font-bold">Filters</p>
              <Button size="sm" onClick={() => setShowFilters(false)}>Show results</Button>
            </div>
          )}
          {filters}
        </aside>
        <div className="min-w-0 flex-1">
          {data.isLoading ? <Spinner /> : !data.data?.results.length ? (
            <Empty icon={Store} title="No assets match" text="Try removing a filter or searching for something broader." />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.data.results.map((l) => <ListingCard key={l.id} listing={l} />)}
              </div>
              {(data.data.next || data.data.previous) && (
                <div className="mt-8 flex justify-center gap-2">
                  <Button variant="secondary" disabled={!data.data.previous} onClick={() => set("page", String(page - 1))}>Previous</Button>
                  <Button variant="secondary" disabled={!data.data.next} onClick={() => set("page", String(page + 1))}>Next</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Marketplace />
    </Suspense>
  );
}
