import { BadgeCheck, FileCheck2, Gavel, KeyRound, ListChecks, Lock, MessagesSquare, ShieldAlert, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

const BUY = [
  { icon: Wallet, t: "Top up your wallet", d: "Add money with bKash, Nagad, Rocket, bank transfer or card. It sits in your Available Balance." },
  { icon: ListChecks, t: "Pick an asset", d: "Every listing is checked by our team. Look for the green “Verified metrics” badge." },
  { icon: Lock, t: "Buy now or make an offer", d: "When you pay, the money moves into escrow (your Pending Balance). The seller cannot touch it." },
  { icon: MessagesSquare, t: "Handover in the escrow room", d: "A private 3-way chat opens between you, the seller and a Media escrow agent." },
  { icon: KeyRound, t: "Take full ownership", d: "Change passwords, recovery email/phone, and remove the seller’s admin access. Only then confirm with your OTP." },
  { icon: ShieldAlert, t: "72-hour protection", d: "Funds release to the seller 72 hours after you confirm. Something wrong? Open a dispute before then." },
];
const SELL = [
  { icon: FileCheck2, t: "List your asset", d: "Add real numbers and upload income or ownership proof — it’s encrypted and seen only by our team." },
  { icon: BadgeCheck, t: "Get approved", d: "We check the asset and publish it. Verify your identity (KYC) for a trusted-seller badge and no trade limits." },
  { icon: MessagesSquare, t: "Transfer when paid", d: "You’re notified the moment a buyer’s money is locked in escrow. Then hand over access in the escrow room." },
  { icon: Wallet, t: "Get paid", d: "After the protection window your money (minus the 5% platform fee) lands in your Available Balance — withdraw to bKash, Nagad, Rocket or bank." },
];

export default function Tutorial() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">How trading on Media works</h1>
        <p className="mx-auto mt-3 max-w-2xl text-ink-soft">Escrow means neither side has to trust the other. Media holds the money until the asset is safely in the buyer’s hands.</p>
      </div>
      <h2 className="mb-4 mt-12 text-xl font-bold text-ink">Buying</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BUY.map((s, i) => (
          <Card key={s.t} className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><s.icon className="h-5 w-5" /></span>
              <span className="text-xs font-bold text-ink-mute">STEP {i + 1}</span>
            </div>
            <p className="mt-3 font-semibold text-ink">{s.t}</p>
            <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
          </Card>
        ))}
      </div>
      <h2 id="selling" className="mb-4 mt-12 scroll-mt-24 text-xl font-bold text-ink">Selling</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {SELL.map((s, i) => (
          <Card key={s.t} className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><s.icon className="h-5 w-5" /></span>
              <span className="text-xs font-bold text-ink-mute">STEP {i + 1}</span>
            </div>
            <p className="mt-3 font-semibold text-ink">{s.t}</p>
            <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-12 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <Gavel className="h-10 w-10 shrink-0 text-brand-600" />
        <div className="flex-1">
          <p className="font-semibold text-ink">Disputes are decided by a human escrow agent</p>
          <p className="text-sm text-ink-soft">If a seller doesn’t deliver or recovers the asset, open a dispute. Funds are frozen until an agent reviews the chat and evidence and either refunds the buyer or releases to the seller.</p>
        </div>
        <ButtonLink href="/marketplace">Start browsing</ButtonLink>
      </Card>
    </div>
  );
}
