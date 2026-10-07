"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { AdminExportButton } from "@/components/AdminExportButton";
import { Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, dateTime, taka } from "@/lib/format";

/** Listings, balance adjustment (superuser), KYC revoke and temporary password for one user. */
function UserTools({ user, onDone }: { user: any; onDone: () => void }) {
  const { me } = useAuth();
  const listings = useQuery({ queryKey: ["admin-user-listings", user.id], queryFn: () => api<any[]>(`/admin/users/${user.id}/listings/`) });
  const [mode, setMode] = useState<"" | "adjust" | "revoke">("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [temp, setTemp] = useState("");
  const run = useMutation({
    mutationFn: (kind: "adjust" | "revoke" | "temp") =>
      kind === "adjust" ? api(`/admin/users/${user.id}/adjust/`, { body: { amount, reason } })
        : kind === "revoke" ? api(`/admin/users/${user.id}/revoke-kyc/`, { body: { reason } })
        : api(`/admin/users/${user.id}/temp-password/`, { body: {} }),
    onSuccess: (d: any, kind) => {
      if (kind === "temp") setTemp(d.temporary_password);
      setMode("");
      setAmount("");
      setReason("");
      onDone();
    },
  });
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-bold">Listings ({listings.data?.length ?? "…"})</p>
        {!!listings.data?.length && (
          <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {listings.data.map((l) => (
              <li key={l.id}>
                <Link href={`/listings/${l.id}`} target="_blank" className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  <span className="font-semibold">{taka(l.price)}</span>
                  <StatusBadge status={l.status} label={l.status_label} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {me?.is_superuser && <Button size="sm" variant="secondary" onClick={() => setMode(mode === "adjust" ? "" : "adjust")}>Adjust balance</Button>}
        {u_verified(user) && <Button size="sm" variant="secondary" onClick={() => setMode(mode === "revoke" ? "" : "revoke")}>Revoke KYC</Button>}
        {me?.is_superuser && !user.is_superuser && user.id !== me.id && (
          <Button size="sm" variant="secondary" loading={run.isPending && run.variables === "temp"} onClick={() => confirm("Set a new temporary password for this user?") && run.mutate("temp")}>Temporary password</Button>
        )}
      </div>
      {temp && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Temporary password (shown once): <b className="font-mono select-all">{temp}</b></p>}
      {mode && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          {mode === "adjust" && <Field label="Amount (৳)" hint="Positive credits the user, negative debits. Recorded in the ledger as an adjustment."><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500 or -250" /></Field>}
          <Field label={mode === "adjust" ? "Reason (shown to the user)" : "Reason for revoking (sent to the user)"}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button size="sm" variant={mode === "revoke" ? "danger" : "primary"} loading={run.isPending} onClick={() => run.mutate(mode)}>{mode === "adjust" ? "Post adjustment" : "Revoke verification"}</Button>
        </div>
      )}
      <ErrorNote error={run.error} />
    </div>
  );
}

const u_verified = (u: { kyc_status: string }) => u.kyc_status === "verified";

function UserDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-user", id], queryFn: () => api(`/admin/users/${id}/`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-user", id] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };
  const toggle = useMutation({ mutationFn: () => api(`/admin/users/${id}/toggle/`, { body: {} }), onSuccess: refresh });
  const staff = useMutation({ mutationFn: () => api(`/admin/users/${id}/staff/`, { body: {} }), onSuccess: refresh });
  const d = q.data;
  const u = d?.user;

  return (
    <Modal open onClose={onClose} title={u ? `@${u.username}` : "User"} wide>
      {!d ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar username={u.username} src={u.avatar} className="h-14 w-14 text-lg" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-semibold">{u.email} {u.email_verified && <MailCheck className="h-4 w-4 text-sky-600" />}</p>
              <p className="text-xs text-ink-mute">{u.phone || "no phone"} · joined {dateTime(u.date_joined)} · ★ {u.rating.average || "—"} ({u.rating.count}) · {u.completed_trades} trades · {d.listings} listings</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={u.kyc_status} label={`KYC: ${u.kyc_status}`} />
              {u.is_staff && <StatusBadge status="transferred" label={u.is_superuser ? "superuser" : "staff"} />}
              {!u.is_active && <StatusBadge status="rejected" label="suspended" />}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[["Available", d.balances.available], ["In escrow", d.balances.escrow], ["Withdrawing", d.balances.withdraw_hold]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-ink-mute">{k}</p>
                <p className="font-bold">{taka(v, 2)}</p>
              </div>
            ))}
          </div>

          {d.kyc && (
            <div className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">Latest KYC: {d.kyc.full_name} · {d.kyc.doc_type}</p>
              <p className="text-xs text-ink-mute">Submitted {dateTime(d.kyc.created_at)} · {d.kyc.status}{d.kyc.review_note ? ` · ${d.kyc.review_note}` : ""}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-bold">Recent orders</p>
            {!d.orders.length ? <p className="text-sm text-ink-mute">No orders.</p> : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {d.orders.map((o: any) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <span className="min-w-0 flex-1 truncate"><b>{o.code}</b> · {o.role} · {o.title}</span>
                      <span className="font-semibold">{taka(o.amount)}</span>
                      <StatusBadge status={o.status} label={o.status_label.split(" — ")[0]} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <UserTools user={u} onDone={refresh} />

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Link href={`/u/${u.username}`} target="_blank" className="mr-auto self-center text-sm font-semibold text-brand-700">Public profile ↗</Link>
            {!u.is_superuser && u.id !== me?.id && (
              <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()}>{u.is_active ? "Suspend" : "Reactivate"}</Button>
            )}
            {me?.is_superuser && !u.is_superuser && u.id !== me.id && (
              <Button variant={u.is_staff ? "danger" : "primary"} loading={staff.isPending} onClick={() => staff.mutate()}>
                {u.is_staff ? "Remove admin rights" : "Make admin (escrow agent)"}
              </Button>
            )}
          </div>
          <ErrorNote error={toggle.error || staff.error} />
        </div>
      )}
    </Modal>
  );
}

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => api(`/admin/users/?q=${encodeURIComponent(q)}`) });
  return (
    <>
      <PageHeader title="Users" subtitle={users.data ? `${users.data.count} accounts` : ""} action={<AdminExportButton kind="users" />} />
      <Input placeholder="Search email, username or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
      {users.isLoading ? <Spinner /> : (
        <Card className="divide-y divide-slate-100">
          {users.data?.results.map((u: any) => (
            <button key={u.id} onClick={() => setOpen(u.id)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-slate-50">
              <Avatar username={u.username} src={u.avatar} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  @{u.username} {u.is_verified && <BadgeCheck className="h-4 w-4 text-brand-600" />}
                  {u.is_staff && <span className="text-xs text-brand-700">· {u.is_superuser ? "superuser" : "staff"}</span>}
                  {!u.is_active && <span className="text-xs text-rose-600">· suspended</span>}
                </p>
                <p className="truncate text-xs text-ink-mute">{u.email} {u.phone && `· ${u.phone}`} · joined {ago(u.date_joined)} · ★ {u.rating.average || "—"} · {u.completed_trades} trades</p>
              </div>
              <StatusBadge status={u.kyc_status} label={`KYC: ${u.kyc_status}`} />
            </button>
          ))}
        </Card>
      )}
      {open !== null && <UserDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
