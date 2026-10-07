"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { ButtonLink, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { taka } from "@/lib/format";

function ReturnStatus() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const id = sp.get("deposit");
  const hinted = sp.get("result");
  const q = useQuery({
    queryKey: ["deposit", id],
    queryFn: () => api(`/wallet/deposits/${id}/`),
    enabled: !!id,
    // Keep asking while the gateway confirmation is on its way (webhook / IPN).
    refetchInterval: (query) => (query.state.data?.status === "initiated" && query.state.dataUpdateCount < 40 ? 3000 : false),
  });
  const status: string = q.data?.status || (id ? "" : hinted === "success" ? "initiated" : "failed");

  useEffect(() => {
    if (status === "approved") {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["deposits"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  }, [status, qc]);

  if (id && q.isLoading) return <Spinner />;
  const d = q.data;
  const view =
    status === "approved"
      ? { icon: CheckCircle2, tone: "text-emerald-600", title: "Payment received", text: `${taka(d?.amount, 2)} has been added to your available balance.` }
      : status === "initiated" || status === "pending"
        ? { icon: Clock, tone: "text-amber-500", title: "Confirming your payment…", text: "We’re waiting for the payment provider to confirm. This page updates automatically — you can also check your wallet later." }
        : { icon: XCircle, tone: "text-rose-600", title: hinted === "cancelled" ? "Payment cancelled" : "Payment not completed", text: d?.note || "No money was added. If you were charged, contact support with the transaction ID." };

  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <view.icon className={`mx-auto h-14 w-14 ${view.tone}`} />
      <h1 className="mt-4 text-xl font-bold text-ink">{view.title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{view.text}</p>
      {d && (
        <p className="mt-3 text-xs text-ink-mute">
          {d.method_label} · ref {d.reference}{d.gateway_ref ? ` · ${d.gateway_ref}` : ""}
        </p>
      )}
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/dashboard/wallet">Back to wallet</ButtonLink>
        {status === "approved" && <ButtonLink href="/marketplace" variant="secondary">Browse marketplace</ButtonLink>}
      </div>
    </Card>
  );
}

export default function WalletReturn() {
  return (
    <Suspense fallback={<Spinner />}>
      <ReturnStatus />
    </Suspense>
  );
}
