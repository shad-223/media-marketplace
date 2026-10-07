"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LifeBuoy, UserX } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { TICKET_TONE, Ticket, TicketThread } from "@/components/TicketThread";
import { Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, StatusBadge, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, dateTime } from "@/lib/format";

type Deletion = { id: number; user: string; email: string; original_email: string; reason: string; status: string; status_label: string; admin_note: string; blockers: string[]; created_at: string };

function Deletions() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const q = useQuery({ queryKey: ["admin-deletions", status], queryFn: () => api<Deletion[]>(`/admin/deletions/?status=${status}`) });
  const [target, setTarget] = useState<{ d: Deletion; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: () => api(`/admin/deletions/${target!.d.id}/decide/`, { body: { decision: target!.decision, note } }),
    onSuccess: () => { setTarget(null); qc.invalidateQueries({ queryKey: ["admin-deletions"] }); },
  });
  return (
    <>
      <Tabs value={status} onChange={setStatus} tabs={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Deleted" }, { value: "rejected", label: "Rejected" }]} />
      <div className="mt-4 space-y-3">
        {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty icon={UserX} title="No deletion requests" /> : q.data.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">@{d.user} <span className="font-normal text-ink-mute">{d.original_email}</span></p>
                <p className="text-xs text-ink-mute">Requested {dateTime(d.created_at)}{d.reason ? ` · “${d.reason}”` : ""}</p>
                {d.blockers.length > 0 && <p className="mt-1 text-xs text-rose-600">Blocked: {d.blockers.join(" ")}</p>}
                {d.admin_note && <p className="mt-1 text-xs text-ink-mute">Note: {d.admin_note}</p>}
              </div>
              <StatusBadge status={d.status === "pending" ? "pending" : d.status === "approved" ? "completed" : "rejected"} label={d.status_label} />
            </div>
            {d.status === "pending" && (
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" variant="danger" disabled={d.blockers.length > 0} onClick={() => { setNote(""); setTarget({ d, decision: "approve" }); }}>Delete & anonymise</Button>
                <Button size="sm" variant="secondary" onClick={() => { setNote(""); setTarget({ d, decision: "reject" }); }}>Decline</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.decision === "approve" ? "Delete this account?" : "Decline request"}>
        <div className="space-y-4">
          {target?.decision === "approve" && <p className="text-sm text-ink-soft">The login is disabled and personal details are erased. Orders, reviews and the ledger are kept for the records. This can’t be undone.</p>}
          <Field label={target?.decision === "approve" ? "Note (optional)" : "Reason (sent to the user)"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ErrorNote error={decide.error} />
          <Button className="w-full" variant={target?.decision === "approve" ? "danger" : "primary"} loading={decide.isPending} onClick={() => decide.mutate()}>Confirm</Button>
        </div>
      </Modal>
    </>
  );
}

function Support() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = sp.get("tab") === "deletions" ? "deletions" : "tickets";
  const [status, setStatus] = useState("open");
  const selected = Number(sp.get("ticket")) || null;
  const q = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => api<Ticket[]>(`/admin/support/?status=${status}`), enabled: tab === "tickets" });

  return (
    <>
      <PageHeader title="Support" subtitle="User tickets and account-deletion requests." />
      <div className="mb-4">
        <Tabs value={tab} onChange={(v) => router.replace(`/admin/support${v === "deletions" ? "?tab=deletions" : ""}`)} tabs={[{ value: "tickets", label: "Tickets" }, { value: "deletions", label: "Deletion requests" }]} />
      </div>
      {tab === "deletions" ? <Deletions /> : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="min-w-0 space-y-3">
            <Tabs value={status} onChange={setStatus} tabs={[{ value: "open", label: "Waiting" }, { value: "answered", label: "Answered" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
            {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty icon={LifeBuoy} title="No tickets here" /> : (
              <Card className="divide-y divide-slate-100">
                {q.data.map((t) => (
                  <button key={t.id} onClick={() => router.replace(`/admin/support?ticket=${t.id}`)} className={clsx("block w-full px-4 py-3 text-left hover:bg-slate-50", selected === t.id && "bg-brand-50")}>
                    <p className="truncate text-sm font-semibold">{t.subject}</p>
                    <p className="flex items-center justify-between gap-2 text-xs text-ink-mute">
                      <span>{t.code} · @{t.user} · {ago(t.updated_at)}</span>
                      <StatusBadge status={TICKET_TONE[t.status] || t.status} label={t.status} />
                    </p>
                  </button>
                ))}
              </Card>
            )}
          </div>
          <div className="min-w-0">{selected ? <TicketThread id={selected} admin /> : <Empty icon={LifeBuoy} title="Select a ticket" />}</div>
        </div>
      )}
    </>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Support />
    </Suspense>
  );
}
