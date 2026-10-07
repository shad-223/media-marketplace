"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";

import { Card, Empty, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";

type Row = { id: number; actor: string; action: string; target_type: string; target_id: string; summary: string; ip: string | null; created_at: string };

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const params = new URLSearchParams({ ...(action && { action }), ...(actor && { actor }), ...(q && { q }) });
  const data = useQuery({ queryKey: ["admin-audit", params.toString()], queryFn: () => api<{ results: Row[]; actions: string[] }>(`/admin/audit/?${params}`) });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin decision — who did what, to what, and when. Entries can’t be edited." />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {data.data?.actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Input placeholder="Admin username" value={actor} onChange={(e) => setActor(e.target.value)} />
        <Input placeholder="Search summary…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {data.isLoading ? <Spinner /> : !data.data?.results.length ? <Empty icon={History} title="No matching entries" /> : (
        <Card className="divide-y divide-slate-100">
          {data.data.results.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="w-32 shrink-0 text-xs text-ink-mute">{dateTime(r.created_at)}</span>
              <span className="w-40 shrink-0 font-mono text-xs font-semibold text-brand-700">{r.action}</span>
              <span className="min-w-0 flex-1 text-ink">{r.summary}</span>
              <span className="text-xs text-ink-mute">@{r.actor}{r.ip ? ` · ${r.ip}` : ""}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
