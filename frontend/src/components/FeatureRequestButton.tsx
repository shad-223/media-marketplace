"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { api } from "@/lib/api";
import type { Listing } from "@/lib/types";

import { Badge, Button } from "./ui";

/** Seller asks the Media team to feature a live listing on the homepage. */
export function FeatureRequestButton({ listing }: { listing: Listing }) {
  const qc = useQueryClient();
  const req = useMutation({
    mutationFn: () => api(`/me/listings/${listing.id}/request-featured/`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-listings"] }),
    onError: (e) => alert((e as Error).message),
  });
  if (listing.is_featured) return <Badge tone="amber"><Sparkles className="h-3.5 w-3.5" /> Featured</Badge>;
  if (listing.status !== "approved") return null;
  if (listing.featured_requested_at) return <Badge tone="slate">Featuring requested</Badge>;
  return (
    <Button size="sm" variant="ghost" title="Ask the Media team to feature this listing on the homepage" loading={req.isPending} onClick={() => req.mutate()}>
      <Sparkles className="h-4 w-4 text-amber-500" /> Get featured
    </Button>
  );
}
