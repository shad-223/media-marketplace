"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Star, Trash2 } from "lucide-react";

import { api } from "@/lib/api";

export type PayoutAccount = {
  id: number;
  method: string;
  method_label: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  label: string;
  is_default: boolean;
};

type Fill = { method: string; account_number: string; account_name: string; bank_name: string };

/** Saves a withdrawal destination for next time (duplicates are ignored server-side). */
export function savePayoutAccount(w: Fill) {
  return api("/wallet/payout-accounts/", { body: { method: w.method, account_number: w.account_number, account_name: w.account_name, bank_name: w.bank_name } });
}

/** Chips of the user's saved payout accounts; clicking one fills the withdraw form. */
export function PayoutAccountPicker({ selected, onPick }: { selected?: Fill; onPick: (f: Fill) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payout-accounts"], queryFn: () => api<PayoutAccount[]>("/wallet/payout-accounts/") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["payout-accounts"] });
  const remove = useMutation({ mutationFn: (id: number) => api(`/wallet/payout-accounts/${id}/`, { method: "DELETE" }), onSuccess: refresh });
  const makeDefault = useMutation({ mutationFn: (id: number) => api(`/wallet/payout-accounts/${id}/`, { method: "PATCH", body: { is_default: true } }), onSuccess: refresh });
  const accounts = q.data || [];
  if (!accounts.length) return null;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">Saved accounts</p>
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => {
          const active = selected && selected.method === a.method && selected.account_number === a.account_number;
          return (
            <div key={a.id} className={clsx("flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs", active ? "border-brand-500 bg-brand-50" : "border-slate-200")}>
              <button type="button" className="text-left" onClick={() => onPick({ method: a.method, account_number: a.account_number, account_name: a.account_name, bank_name: a.bank_name })}>
                <span className="font-semibold text-ink">{a.label || a.method_label}</span>
                <span className="ml-1 font-mono text-ink-soft">{a.account_number}</span>
              </button>
              <button type="button" title={a.is_default ? "Default" : "Make default"} onClick={() => !a.is_default && makeDefault.mutate(a.id)} className="p-0.5" aria-label="Make default">
                <Star className={clsx("h-3.5 w-3.5", a.is_default ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-400")} />
              </button>
              <button type="button" title="Remove" onClick={() => remove.mutate(a.id)} className="p-0.5 text-slate-300 hover:text-rose-600" aria-label="Remove saved account">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
