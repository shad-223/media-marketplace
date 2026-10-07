"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { BadgeCheck, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import { taka } from "@/lib/format";

import { Avatar } from "./Avatar";
import { Card, Empty, Spinner } from "./ui";

type Row = { rank: number; username: string; is_verified: boolean; avatar: string | null; volume: string; trades: number };

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MEDAL = ["text-amber-500", "text-slate-400", "text-orange-700"];

export function Leaderboard() {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(current);
  const q = useQuery({ queryKey: ["leaderboard", month], queryFn: () => api<{ month: string; results: Row[] }>(`/contest/leaderboard/?month=${month}`) });
  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <Card className="mt-8 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-ink"><Trophy className="h-5 w-5 text-amber-500" /> Leaderboard</h2>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <button onClick={() => setMonth(shift(month, -1))} className="rounded-lg p-1.5 hover:bg-white" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold">{label}</span>
          <button onClick={() => setMonth(shift(month, 1))} disabled={month >= current} className="rounded-lg p-1.5 hover:bg-white disabled:opacity-30" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      {q.isLoading ? <Spinner /> : !q.data?.results.length ? (
        <Empty icon={Trophy} title="No completed trades this month yet" text="Complete an escrow trade to get on the board." />
      ) : (
        <ol className="divide-y divide-slate-100">
          {q.data.results.map((r) => (
            <li key={r.username} className="flex items-center gap-3 py-3">
              <span className={clsx("w-7 text-center text-lg font-extrabold", MEDAL[r.rank - 1] || "text-ink-mute")}>{r.rank}</span>
              <Avatar username={r.username} src={r.avatar} className="h-9 w-9 text-xs" />
              <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-1 truncate font-semibold text-ink hover:text-brand-700">
                @{r.username} {r.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" />}
              </Link>
              <div className="text-right">
                <p className="font-bold">{taka(r.volume)}</p>
                <p className="text-xs text-ink-mute">{r.trades} trade{r.trades === 1 ? "" : "s"}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
