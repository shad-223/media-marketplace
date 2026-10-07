"use client";

import { FileLock2 } from "lucide-react";
import Link from "next/link";

import { AdminQueue, DecisionButtons, type Decision } from "@/components/AdminQueue";
import { PlatformIcon } from "@/components/platform";
import { Button, Card, StatusBadge } from "@/components/ui";
import { openProtectedFile } from "@/lib/api";
import { ago, compact, taka } from "@/lib/format";
import type { Listing } from "@/lib/types";

const DECISIONS: Decision[] = [
  { value: "approve", label: "Approve & publish", variant: "success", checkbox: { key: "verified", label: "Metrics verified from proof → show “Verified metrics” badge" } },
  { value: "reject", label: "Reject", variant: "danger", needsNote: true },
];

export default function AdminListings() {
  return (
    <AdminQueue<Listing>
      title="Listing approvals"
      subtitle="Check ownership & income proof before anything goes public."
      endpoint="/admin/listings/"
      statuses={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Live" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }]}
      decisions={DECISIONS}
      empty="No listings in this queue."
      render={(l, decide) => (
        <Card className="p-4">
          <div className="flex flex-wrap items-start gap-3">
            <PlatformIcon category={l.category} boxed className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <Link href={`/listings/${l.id}`} target="_blank" className="font-semibold hover:text-brand-700">{l.title}</Link>
              <p className="text-xs text-ink-mute">{l.category_label} · @{l.seller.username}{l.seller.is_verified ? " (KYC ✓)" : " (not verified)"} · {ago(l.created_at)}</p>
              <p className="mt-1 text-sm text-ink-soft">
                Audience {compact(l.audience)} · traffic {compact(l.monthly_traffic)}/mo · revenue {taka(l.monthly_revenue)}/mo · age {l.age_months}m · <b>{taka(l.price)}</b>
              </p>
              {l.asset_url && <a href={l.asset_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 underline">{l.asset_url}</a>}
              <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{l.description}</p>
              {l.admin_note && <p className="mt-1 text-xs text-ink-mute">Note: {l.admin_note}</p>}
            </div>
            <StatusBadge status={l.status} label={l.status_label} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {l.has_proof ? (
              <Button size="sm" variant="secondary" onClick={() => openProtectedFile(`/admin/listings/${l.id}/proof/`)}><FileLock2 className="h-4 w-4" /> View proof</Button>
            ) : <span className="text-xs text-amber-700">No proof uploaded</span>}
            {["pending", "rejected", "paused"].includes(l.status) && <DecisionButtons decisions={DECISIONS} decide={decide} />}
            {l.status === "approved" && <DecisionButtons decisions={[DECISIONS[1]]} decide={decide} />}
          </div>
        </Card>
      )}
    />
  );
}
