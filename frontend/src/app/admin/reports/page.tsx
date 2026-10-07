"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, StatusBadge, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";

type Report = {
  id: number; reporter: string; listing: number | null; listing_title: string | null; listing_status: string | null;
  user: number | null; user_name: string | null; user_active: boolean | null; reason: string; reason_label: string;
  details: string; status: string; admin_note: string; created_at: string;
};

export default function AdminReports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const q = useQuery({ queryKey: ["admin-reports", status], queryFn: () => api<Report[]>(`/admin/reports/?status=${status}`) });
  const [target, setTarget] = useState<{ r: Report; decision: "resolved" | "dismissed" } | null>(null);
  const [note, setNote] = useState("");
  const [pause, setPause] = useState(false);
  const [suspend, setSuspend] = useState(false);
  const decide = useMutation({
    mutationFn: () => api(`/admin/reports/${target!.r.id}/decide/`, { body: { decision: target!.decision, note, pause_listing: pause, suspend_user: suspend } }),
    onSuccess: () => {
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
  });
  const open = (r: Report, decision: "resolved" | "dismissed") => {
    setNote("");
    setPause(false);
    setSuspend(false);
    setTarget({ r, decision });
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Listings and users flagged by the community." />
      <Tabs value={status} onChange={setStatus} tabs={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "dismissed", label: "Dismissed" }, { value: "all", label: "All" }]} />
      <div className="mt-5 space-y-3">
        {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty icon={Flag} title="No reports here" /> : q.data.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">
                  <Badge tone="red">{r.reason_label}</Badge>{" "}
                  {r.listing ? <Link href={`/listings/${r.listing}`} target="_blank" className="hover:text-brand-700">{r.listing_title}</Link> : <Link href={`/u/${r.user_name}`} target="_blank" className="hover:text-brand-700">@{r.user_name}</Link>}
                </p>
                <p className="mt-1 text-xs text-ink-mute">
                  by @{r.reporter} · {dateTime(r.created_at)}
                  {r.listing_status && ` · listing ${r.listing_status}`}
                  {r.user_active === false && " · user suspended"}
                </p>
                {r.details && <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{r.details}</p>}
                {r.admin_note && <p className="mt-1 text-xs text-ink-mute">Note: {r.admin_note}</p>}
              </div>
              <StatusBadge status={r.status === "open" ? "pending" : r.status === "resolved" ? "completed" : "withdrawn"} label={r.status} />
            </div>
            {r.status === "open" && (
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" variant="success" onClick={() => open(r, "resolved")}>Take action</Button>
                <Button size="sm" variant="secondary" onClick={() => open(r, "dismissed")}>Dismiss</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.decision === "resolved" ? "Resolve report" : "Dismiss report"}>
        <div className="space-y-4">
          {target?.decision === "resolved" && (
            <div className="space-y-2">
              {target.r.listing && target.r.listing_status === "approved" && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={pause} onChange={(e) => setPause(e.target.checked)} /> Pause the listing</label>
              )}
              {target.r.user && target.r.user_active && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} /> Suspend @{target.r.user_name}</label>
              )}
            </div>
          )}
          <Field label="Internal note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ErrorNote error={decide.error} />
          <Button className="w-full" variant={target?.decision === "resolved" ? "success" : "secondary"} loading={decide.isPending} onClick={() => decide.mutate()}>Confirm</Button>
        </div>
      </Modal>
    </>
  );
}
