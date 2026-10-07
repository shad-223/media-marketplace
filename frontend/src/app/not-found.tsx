import { SearchX } from "lucide-react";

import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <SearchX className="h-12 w-12 text-slate-300" />
      <h1 className="mt-4 text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-ink-soft">The page you’re looking for doesn’t exist or was moved.</p>
      <ButtonLink href="/marketplace" className="mt-6">Browse the marketplace</ButtonLink>
    </div>
  );
}
