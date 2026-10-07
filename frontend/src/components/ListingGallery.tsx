"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type GalleryImage = { id: number; url: string | null; order: number };

/** Screenshot strip under the listing cover, with a full-screen lightbox. */
export function ListingGallery({ images }: { images?: GalleryImage[] }) {
  const shots = (images || []).filter((i) => i.url);
  const [open, setOpen] = useState<number | null>(null);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + shots.length) % shots.length)), [shots.length]);

  useEffect(() => {
    if (open === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, step]);

  if (!shots.length) return null;
  return (
    <>
      <div className="scrollbar-none -mt-2 flex gap-2 overflow-x-auto pb-1">
        {shots.map((img, i) => (
          <button key={img.id} onClick={() => setOpen(i)} className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:ring-2 hover:ring-brand-300" aria-label={`Open screenshot ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url!} alt="" className="h-20 w-28 object-cover sm:h-24 sm:w-36" loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" onClick={() => setOpen(null)}>
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close" onClick={() => setOpen(null)}>
            <X className="h-6 w-6" />
          </button>
          {shots.length > 1 && (
            <>
              <button className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-6" aria-label="Previous" onClick={(e) => { e.stopPropagation(); step(-1); }}>
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-6" aria-label="Next" onClick={(e) => { e.stopPropagation(); step(1); }}>
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shots[open].url!} alt="" className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute bottom-4 flex gap-1.5">
            {shots.map((s, i) => (
              <span key={s.id} className={clsx("h-1.5 w-1.5 rounded-full", i === open ? "bg-white" : "bg-white/40")} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
