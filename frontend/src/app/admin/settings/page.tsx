"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button, Card, ErrorNote, Field, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";

type Settings = Record<string, string | number | boolean | null>;

const METHODS = [
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "bank", label: "Bank transfer" },
  { key: "card", label: "Card / USD" },
];

export default function AdminSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<Settings>("/admin/settings/") });
  const [f, setF] = useState<Settings>({});
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<Settings>("/admin/settings/", { method: "PATCH", body: f }),
    onSuccess: (d) => {
      qc.setQueryData(["admin-settings"], d);
      qc.invalidateQueries({ queryKey: ["config"] });
      setMsg("Settings saved. They apply to new trades right away (other server workers within ~30 seconds).");
    },
  });
  if (q.isLoading || !f) return <Spinner />;
  const val = (k: string) => (f[k] ?? "") as string;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMsg("");
    setF({ ...f, [k]: e.target.value });
  };

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <PageHeader title="Platform settings" subtitle="Fees, limits, the announcement bar and where buyers send manual deposits." />

      <Card className="space-y-4 p-6">
        <h2 className="font-bold">Announcement bar</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!f.announcement_enabled} onChange={(e) => setF({ ...f, announcement_enabled: e.target.checked })} /> Show the bar at the top of every page
        </label>
        <Field label="Text"><Input value={val("announcement_text")} maxLength={300} onChange={set("announcement_text")} /></Field>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-bold">Fees & limits</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Platform fee (% of sale, paid by seller)" hint="0 – 30. Applies to orders opened after saving."><Input inputMode="decimal" value={val("platform_fee_percent")} onChange={set("platform_fee_percent")} /></Field>
          <Field label="Buyer protection window (hours)" hint="0 – 720. Time between buyer confirmation and payout."><Input inputMode="numeric" value={val("buyer_protection_hours")} onChange={set("buyer_protection_hours")} /></Field>
          <Field label="Trade limit without KYC (৳)" hint="Per purchase, bid or withdrawal for unverified users."><Input inputMode="decimal" value={val("unverified_trade_limit")} onChange={set("unverified_trade_limit")} /></Field>
          <Field label="Minimum withdrawal (৳)"><Input inputMode="decimal" value={val("min_withdrawal")} onChange={set("min_withdrawal")} /></Field>
          <Field label="USD rate (৳ per $1)" hint="Used for USD prices and card checkout."><Input inputMode="decimal" value={val("usd_rate")} onChange={set("usd_rate")} /></Field>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-bold">Support contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support email"><Input type="email" value={val("support_email")} onChange={set("support_email")} /></Field>
          <Field label="Support phone / WhatsApp"><Input value={val("support_phone")} onChange={set("support_phone")} /></Field>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div>
          <h2 className="font-bold">Manual deposit details</h2>
          <p className="text-sm text-ink-soft">Shown in the wallet when a buyer pays by sending money and entering the transaction ID. Leave a method empty to show “contact support”.</p>
        </div>
        {METHODS.map((m) => (
          <div key={m.key} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[180px_1fr]">
            <p className="text-sm font-semibold">{m.label}</p>
            <div className="space-y-3">
              <Field label={m.key === "bank" ? "Account name, number, bank & branch" : "Merchant / personal number"}><Input value={val(`${m.key}_number`)} onChange={set(`${m.key}_number`)} /></Field>
              <Field label="Instructions"><Textarea rows={2} value={val(`${m.key}_instructions`)} onChange={set(`${m.key}_instructions`)} placeholder="e.g. Use Send Money (not Cash Out). Put your username as reference." /></Field>
            </div>
          </div>
        ))}
      </Card>

      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      <ErrorNote error={save.error} />
      <Button size="lg" loading={save.isPending}>Save settings</Button>
    </form>
  );
}
