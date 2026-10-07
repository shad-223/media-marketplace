"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";

import { Button, Card, ErrorNote, Spinner, StatusBadge, Textarea } from "./ui";

export type Ticket = {
  id: number; code: string; user: string; subject: string; category: string; category_label: string;
  order: number | null; order_code: string | null; status: string; status_label: string; created_at: string; updated_at: string;
};
type Msg = { id: number; sender: string; is_staff_reply: boolean; body: string; created_at: string };

export const TICKET_TONE: Record<string, string> = { open: "pending", answered: "transferred", closed: "completed" };

/** One support conversation; used by both the user and the admin views. */
export function TicketThread({ id, admin }: { id: number; admin?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ticket", id], queryFn: () => api<Ticket & { messages: Msg[] }>(`/support/tickets/${id}/`), refetchInterval: 20_000 });
  const [body, setBody] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["admin-tickets"] });
  };
  const reply = useMutation({ mutationFn: () => api(`/support/tickets/${id}/reply/`, { body: { body } }), onSuccess: () => { setBody(""); refresh(); } });
  const close = useMutation({ mutationFn: () => api(`/support/tickets/${id}/close/`, { body: {} }), onSuccess: refresh });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const t = q.data;
  const mine = (m: Msg) => (admin ? m.is_staff_reply : !m.is_staff_reply);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-mute">{t.code} · {t.category_label}{admin ? ` · @${t.user}` : ""}{t.order_code ? <> · <Link className="text-brand-700" href={admin ? `/admin/orders/${t.order}` : `/dashboard/orders/${t.order}`}>{t.order_code}</Link></> : null}</p>
          <p className="font-bold text-ink">{t.subject}</p>
        </div>
        <StatusBadge status={TICKET_TONE[t.status] || t.status} label={t.status_label} />
      </div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4">
        {t.messages.map((m) => (
          <div key={m.id} className={clsx("flex", mine(m) ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", mine(m) ? "rounded-br-md bg-brand-600 text-white" : m.is_staff_reply ? "rounded-bl-md bg-amber-100 text-amber-950" : "rounded-bl-md bg-white text-ink shadow-sm")}>
              {!mine(m) && <p className="mb-0.5 text-[11px] font-bold opacity-70">{m.sender}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={clsx("mt-1 text-[10px]", mine(m) ? "text-white/70" : "text-ink-mute")}>{dateTime(m.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
      {t.status !== "closed" || admin ? (
        <form className="space-y-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) reply.mutate(); }}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={admin ? "Reply to the user…" : "Add a message…"} className="min-h-[72px]" />
          <ErrorNote error={reply.error || close.error} />
          <div className="flex flex-wrap justify-end gap-2">
            {t.status !== "closed" && <Button type="button" variant="ghost" size="sm" loading={close.isPending} onClick={() => close.mutate()}>Close ticket</Button>}
            <Button size="sm" loading={reply.isPending} disabled={!body.trim()}>{admin ? "Send reply" : "Send"}</Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-slate-100 p-4 text-center text-sm text-ink-mute">This ticket is closed. Open a new one if you need more help.</p>
      )}
    </Card>
  );
}
