"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useState } from "react";

import { Button, Card, ErrorNote, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";

const AUDIENCES = [
  ["all", "Everyone"],
  ["verified", "KYC-verified users"],
  ["sellers", "Sellers (have listed something)"],
  ["buyers", "Buyers (have bought something)"],
];

export default function AdminBroadcast() {
  const [f, setF] = useState({ title: "", body: "", link: "", audience: "all" });
  const [sent, setSent] = useState<number | null>(null);
  const preview = useQuery({
    queryKey: ["broadcast-count", f.audience],
    queryFn: () => api<{ recipients: number }>("/admin/broadcast/", { body: { title: "count", audience: f.audience, dry_run: true } }),
  });
  const send = useMutation({
    mutationFn: () => api<{ recipients: number }>("/admin/broadcast/", { body: f }),
    onSuccess: (d) => {
      setSent(d.recipients);
      setF({ ...f, title: "", body: "", link: "" });
    },
  });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Broadcast" subtitle="Send an in-app notification to a group of users." />
      {sent !== null && <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Sent to {sent} user{sent === 1 ? "" : "s"}.</p>}
      <Card className="p-6">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (confirm(`Send to ${preview.data?.recipients ?? "?"} users?`)) send.mutate(); }}>
          <Field label="Audience" hint={preview.data ? `${preview.data.recipients} recipient(s)` : undefined}>
            <Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Title"><Input value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
          <Field label="Message"><Textarea value={f.body} maxLength={500} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Field label="Link (optional)" hint="A path on this site, e.g. /marketplace or /contest"><Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/marketplace" /></Field>
          <ErrorNote error={send.error} />
          <Button loading={send.isPending}><Megaphone className="h-4 w-4" /> Send notification</Button>
        </form>
      </Card>
    </div>
  );
}
