"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { feeLabel, useConfig } from "@/lib/config";
import type { Listing } from "@/lib/types";

import { GROUPS, GROUP_OF, PLATFORMS } from "./platform";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea } from "./ui";
import { VerifyCode } from "./VerifyCode";

const FIELDS = ["category", "title", "description", "asset_url", "niche", "country", "audience", "monthly_traffic", "monthly_revenue", "age_months", "price"] as const;

export function ListingForm({ listing }: { listing?: Listing }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((k) => [k, listing ? String((listing as any)[k] ?? "") : k === "category" ? "youtube" : k === "country" ? "Bangladesh" : ""])),
  );
  const [monetized, setMonetized] = useState(listing?.monetized ?? false);
  const [offers, setOffers] = useState(listing?.allow_offers ?? true);
  const [thumb, setThumb] = useState<File | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const metric = PLATFORMS[f.category]?.metric || "Audience";
  const cfg = useConfig();

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      for (const k of FIELDS) fd.append(k, k.match(/audience|traffic|revenue|age/) ? f[k] || "0" : f[k]);
      fd.append("monetized", String(monetized));
      fd.append("allow_offers", String(offers));
      if (thumb) fd.append("thumbnail", thumb);
      if (proof) fd.append("proof", proof);
      return api(listing ? `/me/listings/${listing.id}/` : "/me/listings/", { method: listing ? "PATCH" : "POST", body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-listings"] });
      router.push("/dashboard/listings?saved=1");
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-6">
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="font-bold text-ink">The asset</h2>
        <Field label="Category">
          <Select value={f.category} onChange={set("category")}>
            {GROUPS.map((g) => (
              <optgroup key={g.value} label={g.label}>
                {Object.entries(PLATFORMS).filter(([v]) => GROUP_OF[v] === g.value).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Title" hint="e.g. “Bangla tech channel — 120K subs, monetized”">
          <Input value={f.title} onChange={set("title")} required maxLength={140} />
        </Field>
        <Field label="Description" hint="Content type, audience, income sources, what’s included in the transfer.">
          <Textarea value={f.description} onChange={set("description")} required rows={6} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Public URL"><Input type="url" value={f.asset_url} onChange={set("asset_url")} placeholder="https://" /></Field>
          <Field label="Niche"><Input value={f.niche} onChange={set("niche")} placeholder="Tech, Food…" /></Field>
          <Field label="Main audience country"><Input value={f.country} onChange={set("country")} /></Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="font-bold text-ink">Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={metric}><Input inputMode="numeric" value={f.audience} onChange={set("audience")} /></Field>
          <Field label="Monthly visitors / views"><Input inputMode="numeric" value={f.monthly_traffic} onChange={set("monthly_traffic")} /></Field>
          <Field label="Monthly revenue (৳)"><Input inputMode="decimal" value={f.monthly_revenue} onChange={set("monthly_revenue")} /></Field>
          <Field label="Age (months)"><Input inputMode="numeric" value={f.age_months} onChange={set("age_months")} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={monetized} onChange={(e) => setMonetized(e.target.checked)} /> Currently monetized</label>
        <Field label="Ownership / income proof (screenshot or PDF)" hint="Encrypted (AES-256) and visible only to the Media review team. Verified proof earns the green “Verified metrics” badge.">
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm">
            <Lock className="h-4 w-4 shrink-0 text-emerald-600" />
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} className="min-w-0 text-sm" />
            {listing?.has_proof && !proof && <span className="text-xs text-ink-mute">(proof on file)</span>}
          </div>
        </Field>
        {listing ? <VerifyCode listing={listing} /> : <p className="text-xs text-ink-mute">After you submit, you’ll get an ownership code to place on the asset so our team can confirm you control it.</p>}
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="font-bold text-ink">Price & display</h2>
        <Field label="Asking price (৳)" hint={`Media charges the seller a ${feeLabel(cfg.data)} fee when the trade completes. Buyers pay no fee.`}>
          <Input inputMode="decimal" value={f.price} onChange={set("price")} required />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={offers} onChange={(e) => setOffers(e.target.checked)} /> Accept offers (bids) below asking price</label>
        <Field label="Cover image (optional)" hint="JPG/PNG/WebP, up to 8 MB. Without one we show the platform artwork.">
          <input type="file" accept="image/*" onChange={(e) => setThumb(e.target.files?.[0] || null)} className="text-sm" />
        </Field>
      </Card>

      <ErrorNote error={save.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" loading={save.isPending}>{listing ? "Save & resubmit for review" : "Submit for review"}</Button>
        <p className="text-xs text-ink-mute">An escrow agent reviews every listing before it goes live{listing ? " — edits send it back to review" : ""}.</p>
      </div>
    </form>
  );
}
