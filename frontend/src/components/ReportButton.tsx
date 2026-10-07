"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { Button, ErrorNote, Field, Modal, Select, Textarea } from "./ui";

const REASONS = [
  ["scam", "Scam or fraud"],
  ["fake_metrics", "Fake or inflated metrics"],
  ["stolen", "Stolen / not the real owner"],
  ["inappropriate", "Inappropriate content"],
  ["other", "Something else"],
];

/** "Report" link for a listing or a user. Hidden for the owner themselves. */
export function ReportButton({ listing, username, ownerId }: { listing?: number; username?: string; ownerId?: number }) {
  const { me } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  if (me && ownerId && me.id === ownerId) return null;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await api("/reports/", { body: { listing, user: username, reason, details } });
      setDone(true);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => (me ? setOpen(true) : router.push("/login"))}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-mute hover:text-rose-600"
      >
        <Flag className="h-3.5 w-3.5" /> Report {listing ? "listing" : "user"}
      </button>
      <Modal open={open} onClose={() => (setOpen(false), setDone(false))} title={done ? "Thanks — report received" : `Report this ${listing ? "listing" : "user"}`}>
        {done ? (
          <p className="text-sm text-ink-soft">Our escrow team will review it. You’ll get a notification when it’s handled.</p>
        ) : (
          <div className="space-y-4">
            <Field label="What’s wrong?">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Details (optional)"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Links, screenshots described, what happened…" /></Field>
            <ErrorNote error={err} />
            <Button variant="danger" className="w-full" loading={busy} onClick={send}>Send report</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
