"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera, LogOut, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { DeleteAccountCard } from "@/components/DeleteAccountCard";
import { OtpField } from "@/components/OtpField";
import { Button, Card, ErrorNote, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Settings() {
  const { me, logout } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [p, setP] = useState({ phone: me?.phone || "", bio: me?.bio || "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [otp, setOtp] = useState("");
  const [verifyOtp, setVerifyOtp] = useState("");
  const [msg, setMsg] = useState("");
  const saved = (d: any, text: string) => {
    qc.setQueryData(["me"], d);
    setMsg(text);
  };
  const profile = useMutation({ mutationFn: () => api("/me/", { method: "PATCH", body: p }), onSuccess: (d) => saved(d, "Profile saved.") });
  const password = useMutation({ mutationFn: () => api("/auth/change-password/", { body: { ...pw, otp } }), onSuccess: () => { setPw({ current_password: "", new_password: "" }); setOtp(""); setMsg("Password changed."); } });
  const verify = useMutation({ mutationFn: () => api("/me/verify-email/", { body: { otp: verifyOtp } }), onSuccess: (d) => saved(d, "Email verified.") });
  const avatar = useMutation({
    mutationFn: (f: File | null) => {
      if (!f) return api("/me/avatar/", { method: "DELETE" });
      const fd = new FormData();
      fd.append("avatar", f);
      return api("/me/avatar/", { body: fd });
    },
    onSuccess: (d) => saved(d, "Profile photo updated."),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" action={me && <Link href={`/u/${me.username}`} className="text-sm font-semibold text-brand-700">View public profile →</Link>} />
      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

      <Card className="p-6">
        <h2 className="mb-4 font-bold">Profile photo</h2>
        <div className="flex flex-wrap items-center gap-4">
          {me && <Avatar username={me.username} src={me.avatar} className="h-20 w-20 text-2xl" />}
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar.mutate(f); e.target.value = ""; }} />
            <Button variant="secondary" loading={avatar.isPending} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> Upload photo</Button>
            {me?.avatar && <Button variant="ghost" onClick={() => avatar.mutate(null)}>Remove</Button>}
          </div>
          <p className="w-full text-xs text-ink-mute">JPG, PNG or WebP, up to 2 MB.</p>
        </div>
        <ErrorNote error={avatar.error} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><MailCheck className="h-5 w-5 text-brand-600" /> Email verification</h2>
        {me?.email_verified ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700"><BadgeCheck className="h-4 w-4" /> {me.email} is verified.</p>
        ) : (
          <form className="mt-3 space-y-4" onSubmit={(e) => { e.preventDefault(); verify.mutate(); }}>
            <p className="text-sm text-ink-soft">Confirm <b>{me?.email}</b> so we can reach you about trades and payouts.</p>
            <OtpField purpose="verify_email" value={verifyOtp} onChange={setVerifyOtp} />
            <ErrorNote error={verify.error} />
            <Button loading={verify.isPending} disabled={verifyOtp.length !== 6}>Verify email</Button>
          </form>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-bold">Profile</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); profile.mutate(); }}>
          <Field label="Email"><Input value={me?.email || ""} disabled /></Field>
          <Field label="Username"><Input value={me?.username || ""} disabled /></Field>
          <Field label="Mobile number" hint="Security codes are also sent here by SMS"><Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          <Field label="Short bio" hint="Shown on your seller profile"><Textarea value={p.bio} maxLength={280} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
          <ErrorNote error={profile.error} />
          <Button loading={profile.isPending}>Save profile</Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-bold">Change password</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); password.mutate(); }}>
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required /></Field>
          <Field label="New password"><Input type="password" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required /></Field>
          <OtpField purpose="password" value={otp} onChange={setOtp} />
          <ErrorNote error={password.error} />
          <Button loading={password.isPending} disabled={otp.length !== 6}>Change password</Button>
        </form>
      </Card>
      <DeleteAccountCard />
      <Button variant="secondary" onClick={() => { logout(); router.push("/"); }}><LogOut className="h-4 w-4" /> Log out</Button>
    </div>
  );
}
