"use client";

import { AdminQueue, DecisionButtons, type Decision } from "@/components/AdminQueue";
import { Badge, Card, StatusBadge } from "@/components/ui";
import { dateTime, taka } from "@/lib/format";

const DECISIONS: Decision[] = [
  { value: "paid", label: "Mark as paid", variant: "success", extra: { key: "payout_reference", label: "Payout transaction ID" } },
  { value: "reject", label: "Reject & return funds", variant: "danger", needsNote: true },
];

export default function AdminWithdrawals() {
  return (
    <AdminQueue<any>
      title="Withdrawal requests"
      subtitle="Send the payout from the gateway first, then record its transaction ID here."
      endpoint="/admin/withdrawals/"
      statuses={[{ value: "pending", label: "Pending" }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" }]}
      decisions={DECISIONS}
      empty="No withdrawals here."
      render={(w, decide, pending) => (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{taka(w.amount, 2)} → {w.method_label} {w.bank_name && `(${w.bank_name})`}</p>
            <p className="text-sm text-ink-soft"><span className="font-mono">{w.account_number}</span> · {w.account_name}</p>
            <p className="text-xs text-ink-mute">@{w.user} {w.user_verified ? <Badge tone="green">KYC ✓</Badge> : <Badge tone="amber">not verified</Badge>} · {dateTime(w.created_at)}{w.payout_reference && ` · ref ${w.payout_reference}`}{w.note && ` · ${w.note}`}</p>
          </div>
          <StatusBadge status={w.status} />
          {pending && <DecisionButtons decisions={DECISIONS} decide={decide} />}
        </Card>
      )}
    />
  );
}
