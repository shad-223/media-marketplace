"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, MessageCircle, Paperclip, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { PlatformIcon } from "@/components/platform";
import { Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api, openProtectedFile } from "@/lib/api";
import { ago, dateTime, taka } from "@/lib/format";

type Conv = {
  id: number;
  role: "buyer" | "seller";
  listing: { id: number; title: string; category: string; price: string; status: string };
  other: { username: string; is_verified: boolean };
  unread: number;
  last_message: string;
  last_at: string;
};
type Msg = { id: number; sender: string; mine: boolean; body: string; has_attachment: boolean; attachment_name: string | null; created_at: string };

function Thread({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inbox", id], queryFn: () => api<{ conversation: Conv; messages: Msg[] }>(`/inbox/${id}/`), refetchInterval: 5_000 });
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [q.data?.messages.length]);
  useEffect(() => {
    // Opening a thread marks it read server-side — refresh the badges.
    if (q.data) qc.invalidateQueries({ queryKey: ["inbox"], exact: true });
  }, [q.data?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("body", body);
      if (file) fd.append("file", file);
      return api(`/inbox/${id}/`, { body: fd });
    },
    onSuccess: () => {
      setBody("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const c = q.data.conversation;
  return (
    <Card className="flex h-[calc(100vh-14rem)] min-h-[460px] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100 md:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button>
        <PlatformIcon category={c.listing.category} boxed className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <Link href={`/listings/${c.listing.id}`} className="block truncate text-sm font-bold text-ink hover:text-brand-700">{c.listing.title}</Link>
          <p className="text-xs text-ink-mute">with <Link href={`/u/${c.other.username}`} className="hover:text-brand-700">@{c.other.username}</Link> · you’re the {c.role} · {taka(c.listing.price)}</p>
        </div>
      </div>
      <p className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        <ShieldAlert className="h-4 w-4 shrink-0" /> Never pay outside Media escrow or share passwords here. Off-platform deals aren’t protected.
      </p>
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4">
        {!q.data.messages.length && <p className="py-8 text-center text-sm text-ink-mute">No messages yet. Say hello!</p>}
        {q.data.messages.map((m) => (
          <div key={m.id} className={clsx("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", m.mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-ink shadow-sm")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.has_attachment && (
                <button onClick={() => openProtectedFile(`/inbox/${id}/messages/${m.id}/file/`)} className={clsx("mt-1.5 flex items-center gap-1 text-xs font-semibold underline", m.mine ? "text-white" : "text-brand-700")}>
                  <Paperclip className="h-3.5 w-3.5" /> {m.attachment_name}
                </button>
              )}
              <p className={clsx("mt-1 text-[10px]", m.mine ? "text-white/70" : "text-ink-mute")}>{dateTime(m.created_at)}</p>
            </div>
          </div>
        ))}
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
            placeholder="Write a message…"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-300 focus:outline-none"
          />
          <Button loading={send.isPending} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </div>
        <ErrorNote error={send.error} />
      </form>
    </Card>
  );
}

function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const active = Number(sp.get("c")) || null;
  const q = useQuery({ queryKey: ["inbox"], queryFn: () => api<{ results: Conv[]; unread: number }>("/inbox/"), refetchInterval: 15_000 });
  const list = q.data?.results || [];
  const select = (id: number | null) => router.replace(id ? `/dashboard/messages?c=${id}` : "/dashboard/messages", { scroll: false });

  return (
    <>
      <PageHeader title="Messages" subtitle="Questions between buyers and sellers before a trade. Once paid, use the escrow room on the order." />
      {q.isLoading ? <Spinner /> : !list.length ? (
        <Empty icon={MessageCircle} title="No conversations yet" text="Tap “Message seller” on any listing to ask a question before you buy." />
      ) : (
        <div className="grid gap-4 md:grid-cols-[300px_1fr]">
          <Card className={clsx("divide-y divide-slate-100 self-start overflow-hidden", active && "hidden md:block")}>
            {list.map((c) => (
              <button key={c.id} onClick={() => select(c.id)} className={clsx("flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50", active === c.id && "bg-brand-50")}>
                <PlatformIcon category={c.listing.category} boxed className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">@{c.other.username}</span>
                    <span className="shrink-0 text-[10px] text-ink-mute">{ago(c.last_at)}</span>
                  </p>
                  <p className="truncate text-xs text-ink-soft">{c.listing.title}</p>
                  <p className={clsx("truncate text-xs", c.unread ? "font-semibold text-ink" : "text-ink-mute")}>{c.last_message || "—"}</p>
                </div>
                {c.unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
              </button>
            ))}
          </Card>
          <div className={clsx("min-w-0", !active && "hidden md:block")}>
            {active ? <Thread key={active} id={active} onBack={() => select(null)} /> : (
              <Card className="flex h-full min-h-[300px] items-center justify-center p-8 text-sm text-ink-mute">Pick a conversation</Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inbox />
    </Suspense>
  );
}
