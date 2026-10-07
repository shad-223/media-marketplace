"use client";

import { AdminExportButton } from "@/components/AdminExportButton";
import { AdminQueue, DecisionButtons, type Decision } from "@/components/AdminQueue";
import { Card, StatusBadge } from "@/components/ui";
import { dateTime, taka } from "@/lib/format";

const DECISIONS: Decision[] = [
  { value: "approve", label: "Verify & credit", variant: "success" },
  { value: "reject", label: "Reject", variant: "danger", needsNote: true },
];

export default function AdminDeposits() {
  return (
    <AdminQueue<any>
      title="Deposits"
      subtitle="Match the transaction ID in the bKash / Nagad / Rocket / bank statement before crediting."
      endpoint="/admin/deposits/"
      action={<AdminExportButton kind="deposits" />}
      statuses={[{ value: "pending", label: "Pending" }, { value: "initiated", label: "Online (awaiting)" }, { value: "approved", label: "Credited" }, { value: "failed", label: "Failed" }, { value: "rejected", label: "Rejected" }]}
      decisions={DECISIONS}
      empty="No deposits here."
      render={(d, decide, pending) => (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{taka(d.amount, 2)} via {d.method_label}</p>
            {d.gateway ? (
              <p className="text-sm text-ink-soft">
                Online · {d.gateway} · invoice <span className="font-mono">{d.reference}</span>
                {d.gateway_ref && <> · gateway ref <span className="font-mono">{d.gateway_ref}</span></>}
                {d.gateway_currency === "USD" && ` · $${d.gateway_amount}`}
              </p>
            ) : (
              <p className="text-sm text-ink-soft">TrxID <span className="font-mono">{d.reference}</span>{d.sender && ` · from ${d.sender}`}</p>
            )}
            <p className="text-xs text-ink-mute">@{d.user} · {dateTime(d.created_at)}{d.note && ` · ${d.note}`}</p>
          </div>
          <StatusBadge status={d.status === "approved" ? "completed" : d.status === "failed" ? "rejected" : d.status === "initiated" ? "pending" : d.status} label={d.status === "approved" ? "credited" : d.status_label || d.status} />
          {pending && <DecisionButtons decisions={DECISIONS} decide={decide} />}
        </Card>
      )}
    />
  );
}
