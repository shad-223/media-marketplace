"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellPlus, Check } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { PLATFORMS } from "./platform";
import { Button, ErrorNote, Field, Input, Modal } from "./ui";

const KEYS = ["q", "category", "group", "min_price", "max_price", "min_audience", "verified", "monetized"];

function suggestName(p: Record<string, string>) {
  const parts = [p.q && `“${p.q}”`, p.category && (PLATFORMS[p.category]?.short || p.category), p.group, p.max_price && `under ৳${Number(p.max_price).toLocaleString("en-IN")}`];
  return parts.filter(Boolean).join(" · ") || "My search";
}

/** Saves the current marketplace filters; the buyer is notified when a new matching listing goes live. */
export function SaveSearchButton() {
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useAuth();
  const qc = useQueryClient();
  const params = Object.fromEntries(KEYS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k) as string]));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => api("/me/saved-searches/", { body: { name: name || suggestName(params), params } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches"] }),
  });
  if (!Object.keys(params).length) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => (me ? (setName(suggestName(params)), save.reset(), setOpen(true)) : router.push("/login?next=/marketplace"))}>
        <BellPlus className="h-4 w-4" /> Save search
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Get alerts for this search">
        {save.isSuccess ? (
          <div className="space-y-4 text-sm">
            <p className="flex items-center gap-2 text-emerald-700"><Check className="h-5 w-5" /> Saved. We’ll notify you when a new matching asset goes live.</p>
            <Link href="/dashboard/alerts" className="font-semibold text-brand-700">Manage alerts →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
            <ErrorNote error={save.error} />
            <Button className="w-full" loading={save.isPending} onClick={() => save.mutate()}>Save & notify me</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
