"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";

import { Button, Card, Input, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";

export default function AdminUsers() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => api(`/admin/users/?q=${encodeURIComponent(q)}`) });
  const toggle = useMutation({
    mutationFn: (id: number) => api(`/admin/users/${id}/toggle/`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e) => alert((e as Error).message),
  });
  return (
    <>
      <PageHeader title="Users" subtitle={users.data ? `${users.data.count} accounts` : ""} />
      <Input placeholder="Search email, username or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
      {users.isLoading ? <Spinner /> : (
        <Card className="divide-y divide-slate-100">
          {users.data?.results.map((u: any) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold uppercase text-brand-700">{u.username.slice(0, 2)}</div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">@{u.username} {u.is_verified && <BadgeCheck className="h-4 w-4 text-brand-600" />} {u.is_staff && <span className="text-xs text-brand-700">· staff</span>}</p>
                <p className="text-xs text-ink-mute">{u.email} {u.phone && `· ${u.phone}`} · joined {ago(u.date_joined)} · ★ {u.rating.average || "—"} · {u.completed_trades} trades</p>
              </div>
              <StatusBadge status={u.kyc_status} label={`KYC: ${u.kyc_status}`} />
              {!u.is_staff && <Button size="sm" variant="secondary" onClick={() => toggle.mutate(u.id)}>{u.is_active === false ? "Reactivate" : "Suspend"}</Button>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
