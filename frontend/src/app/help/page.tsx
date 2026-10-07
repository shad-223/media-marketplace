import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";

import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Help & FAQ" };

const FAQ: { group: string; items: [string, string][] }[] = [
  {
    group: "Escrow & safety",
    items: [
      ["How does escrow protect me?", "When you buy, your money is locked by Media — the seller can see it’s there but can’t touch it. The seller transfers the asset, you check you have full control and confirm with a one-time code. The seller is paid only after the buyer-protection window passes."],
      ["What is the buyer-protection window?", "After you confirm the handover, funds stay in escrow for a short window (72 hours by default). If the seller tries to recover the asset or something undisclosed appears, open a dispute before the window ends."],
      ["Can I pay the seller directly?", "No. Never pay or accept money outside Media. Off-platform payments aren’t protected and can get both accounts suspended."],
    ],
  },
  {
    group: "Buying",
    items: [
      ["How do I add money?", "Go to Dashboard → Wallet → Add money and pay with bKash, Nagad, Rocket, bank transfer or card. Enter the transaction ID so we can match your payment."],
      ["Can I offer less than the asking price?", "Yes — use “Make an offer” on any listing that accepts offers. If the seller accepts, you can pay the offer price into escrow."],
      ["What should I check before confirming?", "Make sure you are the owner/primary admin, the login email and recovery phone are yours, two-factor authentication is set to your device, and the seller’s access has been removed."],
    ],
  },
  {
    group: "Selling",
    items: [
      ["How do I list an asset?", "Click Sell, fill in honest metrics and upload income or ownership proof. Our team reviews every listing, usually within a day."],
      ["What does Media charge?", "Sellers pay a platform fee on completed sales (shown on the listing form). Listing is free and buyers pay no fee."],
      ["How do I prove I own the asset?", "Each listing has a code like MEDIA-XXXXXX. Put it in your channel description, page About section or website, and our team can confirm ownership automatically."],
    ],
  },
  {
    group: "Account & money",
    items: [
      ["Why should I verify my identity (KYC)?", "Verified traders get a badge buyers trust and have no per-trade limit. Upload your NID, passport or driving licence under Verify identity."],
      ["How do withdrawals work?", "Withdraw your available balance to bKash, Nagad, Rocket or your bank. You’ll confirm with a verification code; our finance team usually pays within 24 hours."],
      ["Something went wrong with a trade — what now?", "Open a dispute inside the order’s escrow room. For anything else, open a support ticket from your dashboard."],
    ],
  },
];

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Help & FAQ</h1>
      <p className="mt-2 text-ink-soft">Answers to the questions traders ask most.</p>
      {FAQ.map((g) => (
        <section key={g.group} className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-mute">{g.group}</h2>
          <Card className="divide-y divide-slate-100">
            {g.items.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink">
                  {q}
                  <span className="text-xl leading-none text-ink-mute transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{a}</p>
              </details>
            ))}
          </Card>
        </section>
      ))}
      <Card className="mt-10 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <LifeBuoy className="h-10 w-10 shrink-0 text-brand-600" />
        <div className="flex-1">
          <p className="font-semibold text-ink">Still need help?</p>
          <p className="text-sm text-ink-soft">Open a support ticket and our team will reply in your dashboard.</p>
        </div>
        <ButtonLink href="/dashboard/support">Contact support</ButtonLink>
      </Card>
    </div>
  );
}
