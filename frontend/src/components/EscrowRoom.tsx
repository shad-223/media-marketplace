"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, Check, Clock, Paperclip, Send, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api, openProtectedFile } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { countdown, dateTime, taka } from "@/lib/format";
import { useLiveChannel } from "@/lib/live";
import type { Order } from "@/lib/types";

import { OtpField } from "./OtpField";
import { PlatformIcon } from "./platform";
import { Button, Card, ErrorNote, Field, Modal, Spinner, StatusBadge, Textarea } from "./ui";

type Msg = { id: number; sender: string; role: "buyer" | "seller" | "admin" | "system"; body: string; has_attachment: boolean; attachment_name: string | null; created_at: string };

const STEPS = [
  { key: "in_escrow", label: "Paid into escrow" },
  { key: "transferred", label: "Seller transferred" },
  { key: "protection", label: "Buyer confirmed" },
  { key: "completed", label: "Funds released" },
];

function Timeline({ o }: { o: Order }) {
  const idx = o.status === "refunded" ? -1 : STEPS.findIndex((s) => s.key === o.status);
  const done = o.status === "completed" ? 4 : idx;
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const state = i < done || o.status === "completed" ? "done" : i === done ? "current" : "todo";
        return (
          <li key={s.key} className="flex flex-col items-center text-center">
            <span className={clsx("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold", state === "done" ? "bg-emerald-500 text-white" : state === "current" ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-slate-100 text-ink-mute")}>
              {state === "done" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={clsx("mt-1.5 text-[11px] font-medium leading-tight sm:text-xs", state === "todo" ? "text-ink-mute" : "text-ink")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function EscrowRoom({ id, admin }: { id: string; admin?: boolean }) {
  const qc = useQueryClient();
  const hours = useConfig().data?.buyer_protection_hours ?? 72;
  // Server pushes new messages + status changes; polling only runs (slowly) while the socket is down.
  const live = useLiveChannel(`/ws/orders/${id}/`, async (ev) => {
    if (ev.event === "message") {
      const have = qc.getQueryData<Msg[]>(["messages", id]) || [];
      const after = have.length ? have[have.length - 1].id : 0;
      const fresh = await api<Msg[]>(`/orders/${id}/messages/?after=${after}`).catch(() => null);
      if (!fresh) return qc.invalidateQueries({ queryKey: ["messages", id] });
      qc.setQueryData<Msg[]>(["messages", id], (old = []) => {
        const seen = new Set(old.map((m) => m.id));
        return [...old, ...fresh.filter((m) => !seen.has(m.id))];
      });
    } else if (ev.event === "order") {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const fallback = live ? false : 30_000;
  const order = useQuery({ queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}/`), refetchInterval: fallback });
  const msgs = useQuery({ queryKey: ["messages", id], queryFn: () => api<Msg[]>(`/orders/${id}/messages/`), refetchInterval: fallback });
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [modal, setModal] = useState<"" | "confirm" | "dispute" | "transfer" | "review" | "release" | "refund" | "cancel">("");
  const [otp, setOtp] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [msgs.data?.length]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["messages", id] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };
  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("body", body);
      if (file) fd.append("file", file);
      return api(`/orders/${id}/messages/`, { body: fd });
    },
    onSuccess: () => {
      setBody("");
      setFile(null);
      refresh();
    },
  });
  const act = useMutation({
    mutationFn: (payload: Record<string, any>) => api(admin && ["release", "refund"].includes(payload.action) ? `/admin/orders/${id}/action/` : `/orders/${id}/action/`, { body: payload }),
    onSuccess: () => {
      setModal("");
      setOtp("");
      setText("");
      refresh();
    },
  });

  if (order.isLoading) return <Spinner />;
  if (!order.data) return <ErrorNote error={order.error} />;
  const o = order.data;
  const role = o.my_role;
  const open = ["in_escrow", "transferred", "protection"].includes(o.status);
  const myReview = o.reviews?.find((r) => r.reviewer === (role === "buyer" ? o.buyer.username : o.seller.username));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-3">
            <PlatformIcon category={o.listing.category} boxed className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink-mute">{o.code} · opened {dateTime(o.created_at)}</p>
              <Link href={`/listings/${o.listing.id}`} className="block truncate text-lg font-bold text-ink hover:text-brand-700">{o.listing.title}</Link>
              <p className="text-sm text-ink-soft">Buyer @{o.buyer.username} · Seller @{o.seller.username}</p>
            </div>
            <StatusBadge status={o.status} label={o.status_label} />
          </div>
          <div className="mt-6"><Timeline o={o} /></div>
          {o.status === "protection" && (
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <Clock className="h-4 w-4 shrink-0" /> Buyer protection: funds auto-release on {dateTime(o.release_at)} ({countdown(o.release_at)}).
            </p>
          )}
          {o.status === "disputed" && (
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Dispute open — funds are frozen until an escrow agent decides.
            </p>
          )}
        </Card>

        <Card className="flex h-[560px] flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                Escrow room
                <span className={clsx("flex items-center gap-1 text-[11px] font-semibold", live ? "text-emerald-600" : "text-ink-mute")}>
                  <span className={clsx("h-1.5 w-1.5 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-slate-300")} />
                  {live ? "Live" : "Reconnecting…"}
                </span>
              </p>
              <p className="text-xs text-ink-mute">Buyer · Seller · Media escrow agent — chats are monitored and kept as evidence</p>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4">
            {msgs.data?.map((m) => {
              const mine = (role === "buyer" && m.role === "buyer") || (role === "seller" && m.role === "seller") || (role === "admin" && m.role === "admin");
              if (m.role === "system")
                return (
                  <div key={m.id} className="mx-auto max-w-lg whitespace-pre-line rounded-xl bg-white px-4 py-2.5 text-center text-xs text-ink-soft shadow-sm ring-1 ring-slate-100">
                    {m.body}
                    <span className="mt-1 block text-[10px] text-ink-mute">{dateTime(m.created_at)}</span>
                  </div>
                );
              return (
                <div key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-brand-600 text-white" : m.role === "admin" ? "rounded-bl-md bg-amber-100 text-amber-950" : "rounded-bl-md bg-white text-ink shadow-sm")}>
                    {!mine && <p className="mb-0.5 text-[11px] font-bold opacity-70">{m.role === "admin" ? `🛡 ${m.sender} (escrow agent)` : `@${m.sender} · ${m.role}`}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.has_attachment && (
                      <button onClick={() => openProtectedFile(`/orders/${id}/messages/${m.id}/file/`)} className={clsx("mt-1.5 flex items-center gap-1 text-xs font-semibold underline", mine ? "text-white" : "text-brand-700")}>
                        <Paperclip className="h-3.5 w-3.5" /> {m.attachment_name}
                      </button>
                    )}
                    <p className={clsx("mt-1 text-[10px]", mine ? "text-white/70" : "text-ink-mute")}>{dateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (body.trim() || file) send.mutate(); }} className="border-t border-slate-100 p-3">
            {file && <p className="mb-2 flex items-center gap-1 text-xs text-ink-soft"><Paperclip className="h-3.5 w-3.5" /> {file.name} <button type="button" className="ml-1 text-rose-600" onClick={() => setFile(null)}>remove</button></p>}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl p-2.5 text-ink-soft hover:bg-slate-100" aria-label="Attach file"><Paperclip className="h-5 w-5" /></button>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (body.trim() || file) send.mutate(); } }}
                rows={1}
                placeholder="Write a message… (Shift+Enter for new line)"
                className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-300 focus:outline-none"
              />
              <Button loading={send.isPending} aria-label="Send"><Send className="h-4 w-4" /></Button>
            </div>
            <ErrorNote error={send.error} />
          </form>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="mb-3 font-bold text-ink">Payment</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Price paid</dt><dd className="font-semibold">{taka(o.amount, 2)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Platform fee (seller)</dt><dd>−{taka(o.fee, 2)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="text-ink-soft">Seller receives</dt><dd className="font-bold text-emerald-700">{taka(o.seller_net, 2)}</dd></div>
          </dl>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="font-bold text-ink">{role === "admin" ? "Escrow agent actions" : "Your next step"}</h3>
          {role === "seller" && o.status === "in_escrow" && (
            <>
              <p className="text-sm text-ink-soft">The buyer’s money is locked. Transfer full ownership and share access in the chat, then:</p>
              <Button className="w-full" onClick={() => setModal("transfer")}>Mark as transferred</Button>
            </>
          )}
          {role === "seller" && o.status === "transferred" && <p className="text-sm text-ink-soft">Waiting for the buyer to verify ownership and confirm.</p>}
          {role === "buyer" && o.status === "in_escrow" && <p className="text-sm text-ink-soft">Your money is safe in escrow. Waiting for the seller to transfer the asset.</p>}
          {role === "buyer" && o.status === "transferred" && (
            <>
              <p className="text-sm text-ink-soft">Have you changed passwords, recovery email/phone and removed the seller’s access? Only then confirm.</p>
              <Button variant="success" className="w-full" onClick={() => setModal("confirm")}>Confirm handover</Button>
            </>
          )}
          {o.status === "protection" && role !== "admin" && <p className="text-sm text-ink-soft">Protection window running. Funds release automatically {countdown(o.release_at)}.</p>}
          {o.status === "completed" && role !== "admin" && (myReview ? (
            <p className="text-sm text-ink-soft">You rated this trade {"★".repeat(myReview.rating)}. Thanks!</p>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setModal("review")}><Star className="h-4 w-4" /> Leave a review</Button>
          ))}
          {o.status === "refunded" && <p className="text-sm text-ink-soft">This order was refunded to the buyer.</p>}
          {o.cancel_request && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p><b>@{o.cancel_request.requested_by}</b> asked to cancel: “{o.cancel_request.reason}”</p>
              {role !== "admin" && (o.cancel_request.requested_by === (role === "buyer" ? o.buyer.username : o.seller.username) ? (
                <Button size="sm" variant="ghost" className="mt-2" loading={act.isPending} onClick={() => act.mutate({ action: "cancel_withdraw" })}>Withdraw request</Button>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="danger" loading={act.isPending} onClick={() => act.mutate({ action: "cancel_accept" })}>Agree & refund buyer</Button>
                  <Button size="sm" variant="secondary" onClick={() => act.mutate({ action: "cancel_decline" })}>Decline</Button>
                </div>
              ))}
              {!modal && <ErrorNote error={act.error} />}
            </div>
          )}
          {o.status === "in_escrow" && role !== "admin" && !o.cancel_request && (
            <Button variant="ghost" className="w-full" onClick={() => setModal("cancel")}>Request cancellation</Button>
          )}
          {open && role !== "admin" && (
            <Button variant="ghost" className="w-full text-rose-600" onClick={() => setModal("dispute")}><AlertTriangle className="h-4 w-4" /> Open a dispute</Button>
          )}
          <Link href={`/dashboard/orders/${o.id}/receipt`} className="block text-center text-xs font-semibold text-brand-700">View / print receipt</Link>
          {role === "admin" && (o.status !== "completed" && o.status !== "refunded") && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="success" onClick={() => setModal("release")}>Release</Button>
              <Button variant="danger" onClick={() => setModal("refund")}>Refund</Button>
            </div>
          )}
          {role === "admin" && (o.status === "completed" || o.status === "refunded") && <p className="text-sm text-ink-soft">Order closed {dateTime(o.closed_at)}.</p>}
        </Card>

        {!!o.disputes?.length && (
          <Card className="p-5">
            <h3 className="mb-3 font-bold text-ink">Disputes</h3>
            {o.disputes.map((d) => (
              <div key={d.id} className="mb-3 rounded-xl bg-slate-50 p-3 text-sm last:mb-0">
                <div className="flex items-center justify-between"><span className="font-semibold">@{d.opened_by}</span><StatusBadge status={d.status} /></div>
                <p className="mt-1 text-ink-soft">{d.reason}</p>
                {d.status === "resolved" && <p className="mt-2 text-xs text-ink"><b>Decision:</b> {d.resolution === "refund" ? "refunded to buyer" : "released to seller"} — {d.admin_note}</p>}
              </div>
            ))}
          </Card>
        )}
      </div>

      <Modal open={modal === "transfer"} onClose={() => setModal("")} title="Mark as transferred?">
        <p className="mb-4 text-sm text-ink-soft">Confirm you have handed over full ownership (owner role, login, recovery email/phone) to @{o.buyer.username}.</p>
        <Button className="w-full" loading={act.isPending} onClick={() => act.mutate({ action: "transfer" })}>Yes, I’ve transferred it</Button>
        <ErrorNote error={act.error} />
      </Modal>
      <Modal open={modal === "confirm"} onClose={() => setModal("")} title="Confirm handover">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">This starts the {hours}-hour buyer-protection window, after which {taka(o.seller_net)} is released to the seller. You can still open a dispute during the window.</p>
          <OtpField purpose="handover" value={otp} onChange={setOtp} />
          <Button variant="success" className="w-full" loading={act.isPending} disabled={otp.length !== 6} onClick={() => act.mutate({ action: "confirm", otp })}>I own the asset — confirm</Button>
          <ErrorNote error={act.error} />
        </div>
      </Modal>
      <Modal open={modal === "cancel"} onClose={() => setModal("")} title="Request cancellation">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Only possible before the seller marks the transfer. If the other party agrees, the full {taka(o.amount)} goes back to the buyer and the listing returns to the marketplace.</p>
          <Field label="Reason"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. I can no longer complete this purchase." /></Field>
          <Button className="w-full" loading={act.isPending} onClick={() => act.mutate({ action: "cancel_request", reason: text })}>Send request</Button>
          <ErrorNote error={act.error} />
        </div>
      </Modal>
      <Modal open={modal === "dispute"} onClose={() => setModal("")} title="Open a dispute">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Funds will be frozen and an escrow agent will review the chat and evidence. Attach screenshots in the chat.</p>
          <Field label="What went wrong?"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. The seller has not handed over the recovery email." /></Field>
          <Button variant="danger" className="w-full" loading={act.isPending} onClick={() => act.mutate({ action: "dispute", reason: text })}>Open dispute</Button>
          <ErrorNote error={act.error} />
        </div>
      </Modal>
      <Modal open={modal === "review"} onClose={() => setModal("")} title="Rate this trade">
        <div className="space-y-4">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}><Star className={clsx("h-9 w-9", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} /></button>
            ))}
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="How was the trade?" />
          <Button className="w-full" loading={act.isPending} onClick={() => act.mutate({ action: "review", rating, comment: text })}>Submit review</Button>
          <ErrorNote error={act.error} />
        </div>
      </Modal>
      <Modal open={modal === "release" || modal === "refund"} onClose={() => setModal("")} title={modal === "release" ? "Release funds to seller" : "Refund the buyer"}>
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">{modal === "release" ? `${taka(o.seller_net, 2)} goes to @${o.seller.username}, ${taka(o.fee, 2)} fee to the platform.` : `${taka(o.amount, 2)} returns to @${o.buyer.username} and the listing goes back on sale.`} Any open dispute is resolved with this decision.</p>
          <Field label="Decision note (visible to both parties)"><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Button variant={modal === "release" ? "success" : "danger"} className="w-full" loading={act.isPending} onClick={() => act.mutate({ action: modal, note: text })}>Confirm {modal}</Button>
          <ErrorNote error={act.error} />
        </div>
      </Modal>
    </div>
  );
}
