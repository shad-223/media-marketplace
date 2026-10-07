"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

export type DepositMethod = { account: string; instructions: string };

export type PublicConfig = {
  platform_fee_percent: string;
  buyer_protection_hours: number;
  unverified_trade_limit: string;
  min_withdrawal: string;
  usd_rate: string;
  payments_sandbox: boolean;
  announcement: string;
  support_email: string;
  support_phone: string;
  deposit_methods: Record<string, DepositMethod>;
};

/** Platform settings an admin edits at /admin/settings (falls back to server env defaults). */
export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api<PublicConfig>("/config/"), staleTime: 60_000 });
}

/** Inline live value for server-rendered copy, e.g. <ConfigValue kind="fee" /> -> "5%". */
export function ConfigValue({ kind }: { kind: "fee" | "hours" }) {
  const cfg = useConfig().data;
  if (kind === "hours") return `${cfg?.buyer_protection_hours ?? 72}`;
  return feeLabel(cfg);
}

/** "5%" style label; trims trailing zeros ("2.50" -> "2.5"). */
export function feeLabel(cfg?: PublicConfig) {
  return cfg ? `${Number(cfg.platform_fee_percent)}%` : "the platform";
}
