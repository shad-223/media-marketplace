"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Trash2 } from "lucide-react";
import Link from "next/link";

import { PLATFORMS } from "@/components/platform";
import { Button, ButtonLink, Card, Empty, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, taka } from "@/lib/format";

type Saved = { id: number; name: string; params: Record<string, string>; created_at: string; last_notified_at: string | null };

function describe(p: Record<string, string>) {
  const out: string[] = [];
  if (p.q) out.push(`“${p.q}”`);
  if (p.category) out.push(p.category.split(",").map((c) => PLATFORMS[c]?.short || c).join(", "));
  if (p.group) out.push(p.group);
  if (p.min_price) out.push(`from ${taka(p.min_price)}`);
  if (p.max_price) out.push(`up to ${taka(p.max_price)}`);
  if (p.min_audience) out.push(`${Number(p.min_audience).toLocaleString("en")}+ audience`);
  if (p.verified) out.push("verified only");
  if (p.monetized) out.push("monetized only");
  return out.join(" · ");
}

export default function Alerts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["saved-searches"], queryFn: () => api<Saved[]>("/me/saved-searches/") });
  const del = useMutation({
    mutationFn: (id: number) => api(`/me/saved-searches/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches"] }),
  });
  return (
    <>
      <PageHeader title="Search alerts" subtitle="Get notified the moment a matching asset is approved on the marketplace." action={<ButtonLink href="/marketplace" variant="secondary">New search</ButtonLink>} />
      {q.isLoading ? <Spinner /> : !q.data?.length ? (
        <Empty icon={BellRing} title="No alerts yet" text="Filter the marketplace (e.g. YouTube under ৳1,00,000) and tap “Save search”." action={<ButtonLink href="/marketplace">Browse marketplace</ButtonLink>} />
      ) : (
        <Card className="divide-y divide-slate-100">
          {q.data.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <BellRing className="h-5 w-5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <Link href={`/marketplace?${new URLSearchParams(s.params)}`} className="font-semibold text-ink hover:text-brand-700">{s.name}</Link>
                <p className="text-xs text-ink-mute">{describe(s.params)} · saved {ago(s.created_at)}{s.last_notified_at ? ` · last match ${ago(s.last_notified_at)}` : ""}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-rose-600" aria-label="Delete alert" onClick={() => del.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
