"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Lock, XCircle } from "lucide-react";
import { useState } from "react";

import { Button, Card, ErrorNote, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, taka } from "@/lib/format";

export default function Kyc() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kyc"], queryFn: () => api("/me/kyc/") });
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api("/config/"), staleTime: Infinity });
  const [f, setF] = useState({ full_name: "", doc_type: "nid", doc_number: "" });
  const [files, setFiles] = useState<Record<string, File | null>>({ front: null, back: null, selfie: null });
  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      Object.entries(files).forEach(([k, v]) => v && fd.append(k, v));
      return api("/me/kyc/", { body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (q.isLoading) return <Spinner />;
  const st = q.data.kyc_status;
  const sub = q.data.submission;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Verify your identity" subtitle={`Verified traders get a badge, more buyer trust and no ${taka(cfg.data?.unverified_trade_limit)} per-trade limit.`} />
      {st === "verified" && (
        <Card className="flex items-center gap-4 p-6"><BadgeCheck className="h-10 w-10 text-emerald-600" /><div><p className="font-bold">You’re verified</p><p className="text-sm text-ink-soft">Approved {dateTime(sub?.reviewed_at)}.</p></div></Card>
      )}
      {st === "pending" && (
        <Card className="flex items-center gap-4 p-6"><Clock className="h-10 w-10 text-amber-500" /><div><p className="font-bold">In review</p><p className="text-sm text-ink-soft">Submitted {dateTime(sub?.created_at)}. We’ll notify you when an agent has checked it.</p></div></Card>
      )}
      {(st === "none" || st === "rejected") && (
        <>
          {st === "rejected" && (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Previous submission rejected: {sub?.review_note}. Please submit again.</p>
          )}
          <Card className="p-6">
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
              <Field label="Full name (as on document)"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Document type">
                  <Select value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value })}>
                    <option value="nid">National ID (NID)</option><option value="passport">Passport</option><option value="driving">Driving licence</option>
                  </Select>
                </Field>
                <Field label="Document number"><Input value={f.doc_number} onChange={(e) => setF({ ...f, doc_number: e.target.value })} required /></Field>
              </div>
              {[["front", "Front side *"], ["back", "Back side"], ["selfie", "Selfie holding the document"]].map(([k, label]) => (
                <Field key={k} label={label}>
                  <input type="file" accept="image/*,application/pdf" required={k === "front"} onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] || null })} className="text-sm" />
                </Field>
              ))}
              <p className="flex items-start gap-2 text-xs text-ink-mute"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Documents are encrypted with AES-256 the moment they arrive and are only viewable by authorised Media reviewers.</p>
              <ErrorNote error={submit.error} />
              <Button size="lg" loading={submit.isPending}>Submit for verification</Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
