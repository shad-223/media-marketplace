"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OtpField } from "@/components/OtpField";
import { Button, Card, ErrorNote, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Settings() {
  const { me, logout } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [p, setP] = useState({ phone: me?.phone || "", bio: me?.bio || "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [otp, setOtp] = useState("");
  const [msg, setMsg] = useState("");
  const profile = useMutation({ mutationFn: () => api("/me/", { method: "PATCH", body: p }), onSuccess: (d) => { qc.setQueryData(["me"], d); setMsg("Profile saved."); } });
  const password = useMutation({ mutationFn: () => api("/auth/change-password/", { body: { ...pw, otp } }), onSuccess: () => { setPw({ current_password: "", new_password: "" }); setOtp(""); setMsg("Password changed."); } });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      <Card className="p-6">
        <h2 className="mb-4 font-bold">Profile</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); profile.mutate(); }}>
          <Field label="Email"><Input value={me?.email || ""} disabled /></Field>
          <Field label="Username"><Input value={me?.username || ""} disabled /></Field>
          <Field label="Mobile number"><Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
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
      <Button variant="secondary" onClick={() => { logout(); router.push("/"); }}><LogOut className="h-4 w-4" /> Log out</Button>
    </div>
  );
}
