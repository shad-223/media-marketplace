"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";

import { Button } from "./ui";

/** Downloads an admin CSV export with the user's JWT (a plain link can't send the token). */
export function AdminExportButton({ kind, label }: { kind: "users" | "orders" | "ledger" | "withdrawals" | "deposits"; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res: Response = await api(`/admin/export/${kind}.csv`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `media-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={download}>
      <Download className="h-4 w-4" /> {label || "Export CSV"}
    </Button>
  );
}
