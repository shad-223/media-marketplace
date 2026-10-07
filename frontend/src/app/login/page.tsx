"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      router.replace(next.startsWith("/") ? next : "/dashboard");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to buy, sell and track your escrow trades.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email or username">
          <Input autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-700">Forgot password?</Link>
        </div>
        <ErrorNote error={err} />
        <Button className="w-full" size="lg" loading={busy}>Log in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        New to Media? <Link href="/register" className="font-semibold text-brand-700">Create an account</Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
