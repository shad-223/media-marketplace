"use client";

import Link from "next/link";

import { EscrowRoom } from "@/components/EscrowRoom";

export default function AdminOrder({ params }: { params: { id: string } }) {
  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-block text-sm font-semibold text-brand-700">← Escrow & disputes</Link>
      <EscrowRoom id={params.id} admin />
    </>
  );
}
