"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Info, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { OtpField } from "@/components/OtpField";
import { Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Select, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, taka } from "@/lib/format";

const MFS_HINT: Record<string, string> = {
  bkash: "Send Money / Payment to Media bKash merchant 01XXXXXXXXX, then enter the TrxID.",
  nagad: "Send Money to Media Nagad 01XXXXXXXXX, then enter the TxnID.",
  rocket: "Send Money to Media Rocket 01XXXXXXXXX-X, then enter the TxnID.",
  bank: "Transfer to Media Ltd, A/C 0000000000, then enter the bank reference.",
  card: "Card / USD checkout (Stripe / SSLCommerz) — enter the payment reference.",
};

export default function WalletPage() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["summary"], queryFn: () => api("/wallet/summary/") });
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api("/config/"), staleTime: Infinity });
  const deps = useQuery({ queryKey: ["deposits"], queryFn: () => api<any[]>("/wallet/deposits/") });
  const wds = useQuery({ queryKey: ["withdrawals"], queryFn: () => api<any[]>("/wallet/withdrawals/") });
  const gws = useQuery({ queryKey: ["gateways"], queryFn: () => api<{ methods: { method: string; online: boolean; gateway_label: string | null; currency: string }[] }>("/wallet/gateways/") });
  const [manual, setManual] = useState(false);
  const [modal, setModal] = useState<"" | "deposit" | "withdraw">("");
  const [d, setD] = useState({ method: "bkash", amount: "", reference: "", sender: "" });
  const [w, setW] = useState({ method: "bkash", amount: "", account_number: "", account_name: "", bank_name: "" });
  const [otp, setOtp] = useState("");

  const done = () => {
    setModal("");
    setOtp("");
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["deposits"] });
    qc.invalidateQueries({ queryKey: ["withdrawals"] });
  };
  const online = gws.data?.methods.find((m) => m.method === d.method && m.online);
  const checkout = useMutation({
    mutationFn: () => api<{ redirect_url: string }>("/wallet/deposits/checkout/", { body: { method: d.method, amount: d.amount } }),
    onSuccess: (r) => {
      window.location.href = r.redirect_url;
    },
  });
  const deposit = useMutation({ mutationFn: () => api("/wallet/deposits/", { body: d }), onSuccess: () => { setD({ ...d, amount: "", reference: "" }); done(); } });
  const withdraw = useMutation({ mutationFn: () => api("/wallet/withdrawals/", { body: { ...w, otp } }), onSuccess: () => { setW({ ...w, amount: "" }); done(); } });
  const sd = s.data || {};
  const history = [
    ...(deps.data || []).map((x) => ({ ...x, type: "Deposit" })),
    ...(wds.data || []).map((x) => ({ ...x, type: "Withdrawal" })),
  ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <>
      <PageHeader title="Wallet" subtitle="Top up to buy, withdraw what you earn." />
      {cfg.data?.payments_sandbox && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Test environment: manual deposits are credited instantly (sandbox).
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5"><p className="text-xs text-ink-mute">Available</p><p className="mt-1 text-2xl font-extrabold text-emerald-700">{taka(sd.available, 2)}</p></Card>
        <Card className="p-5"><p className="text-xs text-ink-mute">Pending (in escrow)</p><p className="mt-1 text-2xl font-extrabold text-amber-700">{taka(sd.pending, 2)}</p><p className="text-xs text-ink-mute">{taka(sd.escrow_locked)} buying · {taka(sd.incoming_from_sales)} incoming</p></Card>
        <Card className="p-5"><p className="text-xs text-ink-mute">Withdrawal in progress</p><p className="mt-1 text-2xl font-extrabold text-ink">{taka(sd.withdraw_in_progress, 2)}</p></Card>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setModal("deposit")}><ArrowDownToLine className="h-4 w-4" /> Add money</Button>
        <Button variant="secondary" onClick={() => setModal("withdraw")}><ArrowUpFromLine className="h-4 w-4" /> Withdraw</Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <p className="border-b border-slate-100 px-5 py-3 font-bold text-ink">Deposits & withdrawals</p>
        {!history.length ? <p className="p-8 text-center text-sm text-ink-mute">No deposits or withdrawals yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.type + h.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                {h.type === "Deposit" ? <ArrowDownToLine className="h-4 w-4 text-emerald-600" /> : <ArrowUpFromLine className="h-4 w-4 text-ink-soft" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{h.type} · {h.method_label}</p>
                  <p className="text-xs text-ink-mute">{dateTime(h.created_at)} · {h.gateway ? `${h.gateway} ${h.gateway_ref || h.reference}` : h.reference || h.account_number}{h.payout_reference ? ` · paid ref ${h.payout_reference}` : ""}{h.note ? ` · ${h.note}` : ""}</p>
                </div>
                <span className={`font-bold ${h.type === "Deposit" ? "text-emerald-700" : ""}`}>{h.type === "Deposit" ? "+" : "−"}{taka(h.amount, 2)}</span>
                <StatusBadge status={h.status === "approved" ? "completed" : h.status === "initiated" ? "pending" : h.status === "failed" ? "rejected" : h.status} label={h.status === "approved" ? "credited" : h.status_label || h.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={modal === "deposit"} onClose={() => setModal("")} title="Add money">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (online && !manual) checkout.mutate(); else deposit.mutate(); }}>
          <Field label="Pay with">
            <Select value={d.method} onChange={(e) => { setD({ ...d, method: e.target.value }); setManual(false); }}>
              <option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="bank">Bank transfer</option><option value="card">Card / USD</option>
            </Select>
          </Field>
          <Field label="Amount (৳)"><Input inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} required /></Field>
          {online && !manual ? (
            <>
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                You’ll be sent to {online.gateway_label} to pay securely, then brought back here. Your balance updates as soon as the payment is confirmed.
                {online.currency === "USD" && cfg.data && d.amount ? ` You’ll be charged about $${(Number(d.amount) / Number(cfg.data.usd_rate)).toFixed(2)}.` : ""}
              </p>
              <ErrorNote error={checkout.error} />
              <Button className="w-full" loading={checkout.isPending}>Pay {d.amount ? taka(d.amount) : ""} with {online.gateway_label}</Button>
              <button type="button" className="w-full text-center text-xs font-semibold text-ink-soft underline" onClick={() => setManual(true)}>Already sent money manually? Enter the transaction ID instead</button>
            </>
          ) : (
            <>
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-ink-soft">{MFS_HINT[d.method]}</p>
              <Field label="Transaction ID"><Input value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} required placeholder="e.g. 9JH7K2L1MX" /></Field>
              <Field label="Sent from (number / account)"><Input value={d.sender} onChange={(e) => setD({ ...d, sender: e.target.value })} /></Field>
              <ErrorNote error={deposit.error} />
              <Button className="w-full" loading={deposit.isPending}>Submit deposit</Button>
              {online && <button type="button" className="w-full text-center text-xs font-semibold text-brand-700 underline" onClick={() => setManual(false)}>Pay online with {online.gateway_label} instead</button>}
            </>
          )}
        </form>
      </Modal>

      <Modal open={modal === "withdraw"} onClose={() => setModal("")} title="Withdraw">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); withdraw.mutate(); }}>
          <p className="text-sm text-ink-soft">Available: <b>{taka(sd.available, 2)}</b> · minimum {taka(cfg.data?.min_withdrawal)}</p>
          <Field label="Withdraw to">
            <Select value={w.method} onChange={(e) => setW({ ...w, method: e.target.value })}>
              <option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="bank">Bank account</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.method === "bank" ? "Account number" : "Wallet number"}><Input value={w.account_number} onChange={(e) => setW({ ...w, account_number: e.target.value })} required /></Field>
            <Field label="Account holder name"><Input value={w.account_name} onChange={(e) => setW({ ...w, account_name: e.target.value })} required /></Field>
          </div>
          {w.method === "bank" && <Field label="Bank & branch"><Input value={w.bank_name} onChange={(e) => setW({ ...w, bank_name: e.target.value })} required /></Field>}
          <Field label="Amount (৳)"><Input inputMode="decimal" value={w.amount} onChange={(e) => setW({ ...w, amount: e.target.value })} required /></Field>
          <OtpField purpose="withdraw" value={otp} onChange={setOtp} />
          <ErrorNote error={withdraw.error} />
          <Button className="w-full" loading={withdraw.isPending} disabled={otp.length !== 6}>Request withdrawal</Button>
          <p className="text-xs text-ink-mute">Withdrawals are reviewed and paid by our finance team, usually within 24 hours.</p>
        </form>
      </Modal>
    </>
  );
}
