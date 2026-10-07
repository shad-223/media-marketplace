"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";

import { Button } from "./ui";

/** Downloads an authenticated CSV (the API needs the JWT, so a plain link won't do). */
export function ExportButton({ path, filename, label = "Export CSV" }: { path: string; filename: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res: Response = await api(path, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="secondary" size="sm" loading={busy} onClick={download}>
      <Download className="h-4 w-4" /> {label}
    </Button>
  );
}
