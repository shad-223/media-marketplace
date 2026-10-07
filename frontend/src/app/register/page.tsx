"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";


export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ email: "", username: "", phone: "", password: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await register(f);
      router.replace("/dashboard");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="One account to buy and sell. Free to join.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" value={f.email} onChange={set("email")} required />
        </Field>
        <Field label="Username" hint="Shown publicly on your listings">
          <Input autoComplete="username" value={f.username} onChange={set("username")} required pattern="[A-Za-z0-9_.]{3,30}" />
        </Field>
        <Field label="Mobile number (optional)" hint="Used for bKash / Nagad payouts and security codes">
          <Input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} required minLength={8} />
        </Field>
        <ErrorNote error={err} />
        <Button className="w-full" size="lg" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </AuthCard>
  );
}
