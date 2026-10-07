"use client";

import { ListingForm } from "@/components/ListingForm";
import { PageHeader } from "@/components/ui";

export default function NewListing() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Sell an asset" subtitle="Honest numbers sell faster — verified listings get the green badge." />
      <ListingForm />
    </div>
  );
}
