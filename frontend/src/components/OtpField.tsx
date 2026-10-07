"use client";

import { useState } from "react";

import { api } from "@/lib/api";

import { Button, Field, Input } from "./ui";

/** "Send code" + 6-digit input. Test environments echo the code back (no SMS gateway yet). */
export function OtpField({ purpose, value, onChange }: { purpose: "withdraw" | "password" | "handover" | "verify_email"; value: string; onChange: (v: string) => void }) {
  const [sent, setSent] = useState<{ sent_to: string; dev_code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    setBusy(true);
    setErr("");
    try {
      setSent(await api("/auth/otp/", { body: { purpose } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label="Verification code (2FA)" error={err} hint={sent ? `Code sent to ${sent.sent_to}. Valid for 10 minutes.` : "We’ll send a 6-digit code to confirm it’s you."}>
      <div className="flex gap-2">
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className="tracking-[0.4em]" />
        <Button type="button" variant="secondary" loading={busy} onClick={send}>
          {sent ? "Resend" : "Send code"}
        </Button>
      </div>
      {sent?.dev_code && (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Test mode — your code is <b className="font-mono">{sent.dev_code}</b>
        </p>
      )}
    </Field>
  );
}
