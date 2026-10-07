"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { useRef } from "react";

import { api } from "@/lib/api";

import type { GalleryImage } from "./ListingGallery";
import { Button, ErrorNote, Field } from "./ui";

export const MAX_IMAGES = 8;

/** Uploads gallery screenshots for a listing that already exists. */
export async function uploadListingImages(listingId: number, files: File[]) {
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append("images", f));
  await api(`/me/listings/${listingId}/images/`, { body: fd });
}

/** Create mode: just collects files; the form uploads them after the listing is created. */
export function GalleryPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  return (
    <Field label={`Screenshots (optional, up to ${MAX_IMAGES})`} hint="Analytics, revenue or dashboard screenshots. JPG/PNG/WebP, 5 MB each. Shown publicly as a gallery.">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => onChange(Array.from(e.target.files || []).slice(0, MAX_IMAGES))}
        className="text-sm"
      />
      {!!files.length && <p className="mt-1 text-xs text-ink-soft">{files.length} screenshot(s) will be uploaded with your listing.</p>}
    </Field>
  );
}

/** Edit mode: changes apply immediately. */
export function ListingImagesManager({ listingId, locked }: { listingId: number; locked?: boolean }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const key = ["listing-images", listingId];
  const q = useQuery({ queryKey: key, queryFn: () => api<GalleryImage[]>(`/me/listings/${listingId}/images/`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["listing", String(listingId)] });
  };
  const upload = useMutation({ mutationFn: (files: File[]) => uploadListingImages(listingId, files), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api(`/me/listings/${listingId}/images/${id}/`, { method: "DELETE" }), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: (order: number[]) => api(`/me/listings/${listingId}/images/reorder/`, { body: { order } }), onSuccess: refresh });
  const imgs = q.data || [];

  const move = (i: number, d: number) => {
    const ids = imgs.map((x) => x.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">Screenshots ({imgs.length}/{MAX_IMAGES})</p>
      <p className="mb-3 text-xs text-ink-mute">Analytics, revenue or dashboard screenshots shown as a public gallery. Changes save immediately.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {imgs.map((img, i) => (
          <div key={img.id} className="group relative overflow-hidden rounded-xl border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url || ""} alt="" className="h-24 w-full object-cover" />
            {!locked && (
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/60 p-1">
                <div className="flex">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-white disabled:opacity-30" aria-label="Move left"><ArrowLeft className="h-4 w-4" /></button>
                  <button type="button" disabled={i === imgs.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-white disabled:opacity-30" aria-label="Move right"><ArrowRight className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => remove.mutate(img.id)} className="rounded p-1 text-rose-200 hover:text-white" aria-label="Delete screenshot"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        ))}
        {!locked && imgs.length < MAX_IMAGES && (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs font-semibold text-ink-soft hover:border-brand-300 hover:text-brand-700">
            <ImagePlus className="h-5 w-5" /> {upload.isPending ? "Uploading…" : "Add screenshots"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []).slice(0, MAX_IMAGES - imgs.length);
          if (files.length) upload.mutate(files);
          e.target.value = "";
        }}
      />
      {locked && <p className="mt-2 text-xs text-ink-mute">Screenshots are locked while the listing is in escrow or sold.</p>}
      <ErrorNote error={upload.error || remove.error || reorder.error} />
      {upload.isPending && <Button type="button" size="sm" variant="ghost" loading className="mt-2">Uploading</Button>}
    </div>
  );
}
