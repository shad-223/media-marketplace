"use client";

import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";

import { ListingCard } from "@/components/ListingCard";
import { ButtonLink, Empty, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Listing } from "@/lib/types";

export default function Saved() {
  const q = useQuery({ queryKey: ["saved"], queryFn: () => api<Listing[]>("/me/saved/") });
  return (
    <>
      <PageHeader title="Saved listings" subtitle="Assets you bookmarked to evaluate later." />
      {q.isLoading ? <Spinner /> : !q.data?.length ? (
        <Empty icon={Bookmark} title="Nothing saved yet" action={<ButtonLink href="/marketplace">Browse marketplace</ButtonLink>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
      )}
    </>
  );
}
