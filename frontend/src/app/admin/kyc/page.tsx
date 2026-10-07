"use client";

import { FileLock2 } from "lucide-react";

import { AdminQueue, DecisionButtons, type Decision } from "@/components/AdminQueue";
import { Button, Card, StatusBadge } from "@/components/ui";
import { openProtectedFile } from "@/lib/api";
import { dateTime } from "@/lib/format";

const DECISIONS: Decision[] = [
  { value: "approve", label: "Approve — issue Verified badge", variant: "success" },
  { value: "reject", label: "Reject", variant: "danger", needsNote: true },
];
const DOC: Record<string, string> = { nid: "National ID", passport: "Passport", driving: "Driving licence" };

export default function AdminKyc() {
  return (
    <AdminQueue<any>
      title="KYC reviews"
      subtitle="Documents are decrypted only when you open them. Match name, number and selfie."
      endpoint="/admin/kyc/"
      statuses={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]}
      decisions={DECISIONS}
      empty="No KYC submissions here."
      render={(k, decide, pending) => (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{k.full_name} <span className="font-normal text-ink-mute">@{k.user.username} · {k.user.email}</span></p>
              <p className="text-sm text-ink-soft">{DOC[k.doc_type]} · <span className="font-mono">{k.doc_number}</span> · submitted {dateTime(k.created_at)}</p>
              {k.review_note && <p className="text-xs text-ink-mute">Note: {k.review_note}</p>}
            </div>
            <StatusBadge status={k.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap gap-2">
              {k.files.map((f: string) => (
                <Button key={f} size="sm" variant="secondary" onClick={() => openProtectedFile(`/admin/kyc/${k.id}/file/${f}/`)}><FileLock2 className="h-4 w-4" /> {f}</Button>
              ))}
            </div>
            {pending && <DecisionButtons decisions={DECISIONS} decide={decide} />}
          </div>
        </Card>
      )}
    />
  );
}
