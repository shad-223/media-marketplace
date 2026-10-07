"use client";

import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import Link from "next/link";

import { ExportButton } from "@/components/ExportButton";
import { Card, Empty, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, taka } from "@/lib/format";

type Row = { id: number; date: string; kind_label: string; memo: string; account: string; account_label: string; amount: string; order: number | null };

const ACCOUNT_TAG: Record<string, string> = { available: "Available", escrow: "Escrow", withdraw_hold: "Withdrawal hold" };

export default function Transactions() {
  const q = useQuery({ queryKey: ["transactions"], queryFn: () => api<Row[]>("/wallet/transactions/") });
  return (
    <>
      <PageHeader title="Transactions" subtitle="Your complete ledger — every deposit, escrow lock, release, fee and withdrawal. Entries are immutable." action={<ExportButton path="/me/export/transactions.csv" filename="media-transactions.csv" />} />
      {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty icon={ReceiptText} title="No transactions yet" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-ink-mute">
              <tr><th className="px-5 py-3">Date</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Balance</th><th className="px-5 py-3 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.map((r) => {
                const n = Number(r.amount);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{dateTime(r.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium">{r.kind_label}</td>
                    <td className="px-3 py-3 text-ink-soft">{r.order ? <Link className="hover:text-brand-700" href={`/dashboard/orders/${r.order}`}>{r.memo}</Link> : r.memo}</td>
                    <td className="px-3 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">{ACCOUNT_TAG[r.account] || r.account_label}</span></td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${n >= 0 ? "text-emerald-700" : "text-ink"}`}>{n >= 0 ? "+" : "−"}{taka(Math.abs(n), 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
