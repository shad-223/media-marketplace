"use client";

import { useQuery } from "@tanstack/react-query";

import { ListingForm } from "@/components/ListingForm";
import { ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Listing } from "@/lib/types";

export default function EditListing({ params }: { params: { id: string } }) {
  const q = useQuery({ queryKey: ["listing", params.id], queryFn: () => api<Listing>(`/listings/${params.id}/`) });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit listing" />
      {q.isLoading ? <Spinner /> : q.data ? <ListingForm listing={q.data} /> : <ErrorNote error={q.error} />}
    </div>
  );
}
