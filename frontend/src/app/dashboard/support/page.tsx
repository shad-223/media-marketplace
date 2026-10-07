"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LifeBuoy, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { TICKET_TONE, Ticket, TicketThread } from "@/components/TicketThread";
import { Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Order } from "@/lib/types";

function NewTicket({ open, onClose }: { open: boolean; onClose: (id?: number) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ subject: "", category: "order", order: "", body: "" });
  const buying = useQuery({ queryKey: ["orders", "buyer"], queryFn: () => api<Order[]>("/orders/?side=buyer"), enabled: open });
  const selling = useQuery({ queryKey: ["orders", "seller"], queryFn: () => api<Order[]>("/orders/?side=seller"), enabled: open });
  const orders = [...(buying.data || []), ...(selling.data || [])];
  const create = useMutation({
    mutationFn: () => api<Ticket>("/support/tickets/", { body: { ...f, order: f.order || null } }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setF({ subject: "", category: "order", order: "", body: "" });
      onClose(t.id);
    },
  });
  return (
    <Modal open={open} onClose={() => onClose()} title="Contact support" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Topic">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="order">Order / escrow</option><option value="payment">Payment / wallet</option><option value="listing">Listing</option><option value="account">Account</option><option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Related order (optional)">
            <Select value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })}>
              <option value="">None</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.listing.title.slice(0, 40)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Subject"><Input value={f.subject} maxLength={140} onChange={(e) => setF({ ...f, subject: e.target.value })} required /></Field>
        <Field label="How can we help?"><Textarea value={f.body} rows={5} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
        <ErrorNote error={create.error} />
        <Button className="w-full" loading={create.isPending}>Send to support</Button>
      </form>
    </Modal>
  );
}

function Support() {
  const sp = useSearchParams();
  const router = useRouter();
  const selected = Number(sp.get("ticket")) || null;
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["tickets"], queryFn: () => api<Ticket[]>("/support/tickets/") });

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Questions about an order, payment or your account? Our team usually replies within a few hours."
        action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New ticket</Button>}
      />
      <p className="mb-4 text-sm text-ink-soft">Quick answers: <Link href="/help" className="font-semibold text-brand-700">Help & FAQ</Link></p>
      {q.isLoading ? <Spinner /> : !q.data?.length ? (
        <Empty icon={LifeBuoy} title="No tickets yet" text="Problem with a trade? Open a ticket — or a dispute inside the order’s escrow room." action={<Button onClick={() => setCreating(true)}>Contact support</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="min-w-0 divide-y divide-slate-100 self-start">
            {q.data.map((t) => (
              <button key={t.id} onClick={() => router.replace(`/dashboard/support?ticket=${t.id}`)} className={clsx("block w-full px-4 py-3 text-left hover:bg-slate-50", selected === t.id && "bg-brand-50")}>
                <p className="truncate text-sm font-semibold">{t.subject}</p>
                <p className="flex items-center justify-between gap-2 text-xs text-ink-mute">
                  <span>{t.code} · {ago(t.updated_at)}</span>
                  <StatusBadge status={TICKET_TONE[t.status] || t.status} label={t.status_label} />
                </p>
              </button>
            ))}
          </Card>
          <div className="min-w-0">{selected ? <TicketThread id={selected} /> : <Empty icon={LifeBuoy} title="Select a ticket" />}</div>
        </div>
      )}
      <NewTicket open={creating} onClose={(id) => { setCreating(false); if (id) router.replace(`/dashboard/support?ticket=${id}`); }} />
    </>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Support />
    </Suspense>
  );
}
