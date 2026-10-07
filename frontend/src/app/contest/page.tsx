import { Medal, Trophy } from "lucide-react";
import type { Metadata } from "next";

import { Leaderboard } from "@/components/Leaderboard";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Contest" };

export default function Contest() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-indigo-700 p-8 text-white sm:p-12">
        <Trophy className="h-12 w-12 text-amber-300" />
        <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">Top Trader Contest</h1>
        <p className="mt-3 max-w-xl text-white/80">
          Every month the traders with the highest completed escrow volume win cash prizes and a featured spot on the marketplace homepage.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard/listings/new" variant="secondary">List an asset</ButtonLink>
          <ButtonLink href="/marketplace" className="bg-white/15 hover:bg-white/25">Browse marketplace</ButtonLink>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { place: "1st", prize: "৳25,000", c: "text-amber-500" },
          { place: "2nd", prize: "৳10,000", c: "text-slate-400" },
          { place: "3rd", prize: "৳5,000", c: "text-orange-700" },
        ].map((p) => (
          <Card key={p.place} className="p-6 text-center">
            <Medal className={`mx-auto h-9 w-9 ${p.c}`} />
            <p className="mt-2 text-sm font-semibold text-ink-mute">{p.place} place</p>
            <p className="text-2xl font-extrabold text-ink">{p.prize}</p>
          </Card>
        ))}
      </div>
      <Leaderboard />
      <Card className="mt-8 p-6">
        <h2 className="font-bold text-ink">Rules</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>Only trades completed through Media escrow count (buying and selling both count).</li>
          <li>Refunded or disputed-and-refunded trades are excluded.</li>
          <li>Winners must have a verified identity (KYC) to receive the prize.</li>
          <li>Leaderboard and prize amounts are set by the Media team each month.</li>
        </ul>
      </Card>
    </div>
  );
}
