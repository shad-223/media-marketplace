"use client";

import { BadgeCheck, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

import { dateTime } from "@/lib/format";
import type { Listing } from "@/lib/types";

const WHERE: Record<string, string> = {
  youtube: "channel description (About tab)",
  facebook: "page / group About section",
  instagram: "bio",
  tiktok: "bio",
  x: "bio",
  telegram: "channel description",
  website: "site footer or a page at the listed URL",
  ecommerce: "store footer or About page",
  saas: "site footer or a page at the listed URL",
  app: "store listing description or the app’s website",
  domain: "a page on the domain (or tell the agent you added a DNS TXT record)",
};

/** Ownership code the seller places on the asset; an escrow agent checks the public URL for it. */
export function VerifyCode({ listing, compact }: { listing: Listing; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!listing.verify_code) return null;
  if (listing.ownership_found)
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <BadgeCheck className="h-4 w-4" /> Ownership verified {listing.ownership_checked_at ? `· ${dateTime(listing.ownership_checked_at)}` : ""}
      </p>
    );
  const copy = () => {
    navigator.clipboard?.writeText(listing.verify_code!).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={compact ? "rounded-xl bg-brand-50 px-3 py-2 text-xs text-ink-soft" : "rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-ink-soft"}>
      <p className="flex flex-wrap items-center gap-2 text-ink">
        <KeyRound className="h-4 w-4 text-brand-600" /> Ownership code
        <code className="rounded-md bg-white px-2 py-0.5 font-mono font-bold tracking-wide text-brand-700">{listing.verify_code}</code>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
          <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      </p>
      <p className="mt-1">
        Put this code in the {WHERE[listing.category] || "asset’s public page"}{listing.asset_url ? " at your listed URL" : " (add the public URL to your listing)"}. Our escrow team checks it to confirm you control the asset — you can remove it after the sale.
        {listing.ownership_found === false && <b className="text-rose-600"> Last check: code not found.</b>}
      </p>
    </div>
  );
}
