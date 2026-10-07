"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";

export default function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<{ detail: string; dev_code?: string } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  const request = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      setInfo(await api("/auth/password-reset/", { body: { email } }));
      setStep("code");
    });
  };
  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/auth/password-reset/confirm/", { body: { email, code, new_password: password } });
      setStep("done");
    });
  };

  return (
    <AuthCard title="Reset your password" subtitle="We’ll send a 6-digit code to the email (and phone) on your account.">
      {step === "email" && (
        <form onSubmit={request} className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <ErrorNote error={err} />
          <Button className="w-full" size="lg" loading={busy}>Send reset code</Button>
        </form>
      )}
      {step === "code" && (
        <form onSubmit={confirm} className="space-y-4">
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-ink-soft">{info?.detail}</p>
          {info?.dev_code && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Test mode — your code is <b className="font-mono">{info.dev_code}</b>
            </p>
          )}
          <Field label="6-digit code">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="tracking-[0.4em]" required />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <ErrorNote error={err} />
          <Button className="w-full" size="lg" loading={busy} disabled={code.length !== 6}>Set new password</Button>
          <button type="button" onClick={() => setStep("email")} className="w-full text-center text-sm font-semibold text-brand-700">Use a different email / resend</button>
        </form>
      )}
      {step === "done" && (
        <div className="space-y-4">
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Your password has been changed. You can log in with it now.</p>
          <Button className="w-full" size="lg" onClick={() => router.push("/login")}>Go to login</Button>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-ink-soft">
        Remembered it? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </AuthCard>
  );
}
