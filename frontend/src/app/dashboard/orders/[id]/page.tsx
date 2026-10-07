"use client";

import Link from "next/link";

import { EscrowRoom } from "@/components/EscrowRoom";

export default function OrderPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Link href="/dashboard/orders" className="mb-4 inline-block text-sm font-semibold text-brand-700">← All orders</Link>
      <EscrowRoom id={params.id} />
    </>
  );
}
