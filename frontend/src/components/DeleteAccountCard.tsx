"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";

import { Button, Card, ErrorNote, Field, Input, Textarea } from "./ui";

type State = { request: { id: number; status: string; created_at: string } | null; blockers: string[] };

/** Settings card: ask Media to delete the account (needs zero balance and no open trades). */
export function DeleteAccountCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["delete-request"], queryFn: () => api<State>("/me/delete-request/") });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const done = () => qc.invalidateQueries({ queryKey: ["delete-request"] });
  const request = useMutation({ mutationFn: () => api("/me/delete-request/", { body: { password, reason } }), onSuccess: () => { setOpen(false); setPassword(""); done(); } });
  const cancel = useMutation({ mutationFn: () => api("/me/delete-request/", { method: "DELETE" }), onSuccess: done });
  const d = q.data;

  return (
    <Card className="border-rose-200 p-6">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-rose-700"><Trash2 className="h-5 w-5" /> Delete account</h2>
      {d?.request ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">You asked to delete your account on {dateTime(d.request.created_at)}. Our team will process it soon.</p>
          <Button variant="secondary" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel request</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">Your login and personal details are erased. Completed trades and the transaction ledger are kept, as required for financial records.</p>
          {!!d?.blockers.length && (
            <ul className="list-disc space-y-1 rounded-xl bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
              {d.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          {!open ? (
            <Button variant="secondary" size="sm" className="text-rose-600" disabled={!!d?.blockers.length} onClick={() => setOpen(true)}>Request account deletion</Button>
          ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
              <Field label="Confirm your password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <Field label="Why are you leaving? (optional)"><Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
              <ErrorNote error={request.error} />
              <div className="flex gap-2">
                <Button variant="danger" size="sm" loading={request.isPending}>Request deletion</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Never mind</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
