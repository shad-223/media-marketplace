"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/lib/api";

import { Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Spinner, Tabs, Textarea } from "./ui";

export type Decision = { value: string; label: string; variant?: "success" | "danger" | "primary"; needsNote?: boolean; extra?: { key: string; label: string }; checkbox?: { key: string; label: string } };

/** Generic "review queue" page: status tabs, a list, and a decide modal. */
export function AdminQueue<T extends { id: number }>({
  title, subtitle, endpoint, statuses, decisions, render, empty, action,
}: {
  action?: React.ReactNode;
  title: string;
  subtitle?: string;
  endpoint: string;
  statuses: { value: string; label: string }[];
  decisions: Decision[];
  render: (item: T, decide: (d: Decision) => void, pending: boolean) => React.ReactNode;
  empty: string;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(statuses[0].value);
  const q = useQuery({ queryKey: [endpoint, status], queryFn: () => api(`${endpoint}?status=${status}`) });
  const [target, setTarget] = useState<{ item: T; d: Decision } | null>(null);
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState("");
  const [check, setCheck] = useState(false);
  const decide = useMutation({
    mutationFn: () =>
      api(`${endpoint}${target!.item.id}/decide/`, {
        body: { decision: target!.d.value, note, ...(target!.d.extra ? { [target!.d.extra.key]: extra } : {}), ...(target!.d.checkbox ? { [target!.d.checkbox.key]: check } : {}) },
      }),
    onSuccess: () => {
      setTarget(null);
      qc.invalidateQueries({ queryKey: [endpoint] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
  const items: T[] = Array.isArray(q.data) ? q.data : q.data?.results || [];
  const isPending = status === "pending";

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={action} />
      <Tabs value={status} onChange={setStatus} tabs={statuses} />
      <div className="mt-5 space-y-3">
        {q.isLoading ? <Spinner /> : !items.length ? <Empty title={empty} /> : items.map((it) => (
          <div key={it.id}>{render(it, (d) => { setNote(""); setExtra(""); setCheck(true); setTarget({ item: it, d }); }, isPending)}</div>
        ))}
      </div>
      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.d.label || ""}>
        <div className="space-y-4">
          {target?.d.extra && <Field label={target.d.extra.label}><Input value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>}
          {target?.d.checkbox && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={check} onChange={(e) => setCheck(e.target.checked)} /> {target.d.checkbox.label}</label>
          )}
          <Field label={target?.d.needsNote ? "Reason (sent to the user)" : "Note (optional)"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ErrorNote error={decide.error} />
          <Button className="w-full" variant={target?.d.variant || "primary"} loading={decide.isPending} onClick={() => decide.mutate()}>{target?.d.label}</Button>
        </div>
      </Modal>
    </>
  );
}

export function DecisionButtons({ decisions, decide }: { decisions: Decision[]; decide: (d: Decision) => void }) {
  return (
    <div className="flex gap-2">
      {decisions.map((d) => (
        <Button key={d.value} size="sm" variant={d.variant === "danger" ? "secondary" : d.variant || "primary"} className={d.variant === "danger" ? "text-rose-600" : ""} onClick={() => decide(d)}>
          {d.label}
        </Button>
      ))}
    </div>
  );
}
