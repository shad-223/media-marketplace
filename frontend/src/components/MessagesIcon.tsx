"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { api } from "@/lib/api";

/** Header shortcut to the pre-sale inbox with an unread badge (refreshed live by the Header's socket). */
export function MessagesIcon() {
  const q = useQuery({ queryKey: ["inbox"], queryFn: () => api("/inbox/"), refetchInterval: 60_000 });
  const unread = q.data?.unread || 0;
  return (
    <Link href="/dashboard/messages" className="relative rounded-xl p-2 text-ink-soft hover:bg-slate-100" aria-label="Messages">
      <MessageCircle className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{unread}</span>
      )}
    </Link>
  );
}
