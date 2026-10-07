"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell } from "lucide-react";
import Link from "next/link";

import { Button, Card, Empty, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications/") });
  const read = useMutation({ mutationFn: (id?: number) => api("/notifications/read/", { body: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const items: any[] = q.data?.results || [];
  return (
    <>
      <PageHeader title="Notifications" action={q.data?.unread ? <Button variant="secondary" size="sm" onClick={() => read.mutate(undefined)}>Mark all read</Button> : null} />
      {q.isLoading ? <Spinner /> : !items.length ? <Empty icon={Bell} title="You’re all caught up" /> : (
        <Card className="divide-y divide-slate-100">
          {items.map((n) => (
            <Link key={n.id} href={n.link || "#"} onClick={() => !n.is_read && read.mutate(n.id)} className={clsx("flex gap-3 px-5 py-4 hover:bg-slate-50", !n.is_read && "bg-brand-50/50")}>
              <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-brand-600")} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{n.title}</p>
                {n.body && <p className="text-sm text-ink-soft">{n.body}</p>}
                <p className="mt-0.5 text-xs text-ink-mute">{ago(n.created_at)}</p>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
