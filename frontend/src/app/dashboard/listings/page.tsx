"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutList, Pause, Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";

import { PlatformIcon } from "@/components/platform";
import { Button, ButtonLink, Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { FeatureRequestButton } from "@/components/FeatureRequestButton";
import { VerifyCode } from "@/components/VerifyCode";
import { api } from "@/lib/api";
import { ago, compact, taka } from "@/lib/format";
import type { Listing } from "@/lib/types";

export default function MyListings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-listings"], queryFn: () => api<Listing[]>("/me/listings/") });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      action === "delete" ? api(`/me/listings/${id}/`, { method: "DELETE" }) : api(`/me/listings/${id}/`, { method: "PATCH", body: { action } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-listings"] }),
    onError: (e) => alert((e as Error).message),
  });

  return (
    <>
      <PageHeader title="My listings" subtitle="Add, edit and manage the assets you’re selling." action={<ButtonLink href="/dashboard/listings/new">+ New listing</ButtonLink>} />
      {q.isLoading ? <Spinner /> : !q.data?.length ? (
        <Empty icon={LayoutList} title="You haven’t listed anything yet" text="List a channel, page, website or app — our team reviews it within 24 hours." action={<ButtonLink href="/dashboard/listings/new">List your first asset</ButtonLink>} />
      ) : (
        <div className="space-y-3">
          {q.data.map((l) => (
            <Card key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <PlatformIcon category={l.category} boxed className="h-12 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <Link href={`/listings/${l.id}`} className="block truncate font-semibold text-ink hover:text-brand-700">{l.title}</Link>
                <p className="text-xs text-ink-mute">{l.category_label} · {compact(l.audience)} · {l.views} views · created {ago(l.created_at)}</p>
                {l.status === "rejected" && l.admin_note && <p className="mt-1 text-xs text-rose-600">Reviewer: {l.admin_note}</p>}
                {!["sold", "reserved"].includes(l.status) && <div className="mt-2"><VerifyCode listing={l} compact /></div>}
              </div>
              <div className="text-right">
                <p className="font-bold">{taka(l.price)}</p>
                <StatusBadge status={l.status} label={l.status_label} />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <FeatureRequestButton listing={l} />
                {!["reserved", "sold"].includes(l.status) && (
                  <ButtonLink href={`/dashboard/listings/${l.id}/edit`} variant="ghost" size="sm"><Pencil className="h-4 w-4" /></ButtonLink>
                )}
                {l.status === "approved" && <Button variant="ghost" size="sm" title="Pause" onClick={() => act.mutate({ id: l.id, action: "pause" })}><Pause className="h-4 w-4" /></Button>}
                {l.status === "paused" && <Button variant="ghost" size="sm" title="Resume" onClick={() => act.mutate({ id: l.id, action: "resume" })}><Play className="h-4 w-4" /></Button>}
                {["pending", "rejected", "paused", "approved"].includes(l.status) && (
                  <Button variant="ghost" size="sm" title="Delete" className="text-rose-600" onClick={() => confirm("Delete this listing?") && act.mutate({ id: l.id, action: "delete" })}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
