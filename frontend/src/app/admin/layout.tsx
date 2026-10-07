"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, BarChart3, Flag, Gavel, History, IdCard, LayoutList, LifeBuoy, Megaphone, Settings, Users } from "lucide-react";

import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useRequireAuth(true);
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => api("/admin/overview/"), enabled: !!me, refetchInterval: 30_000 });
  const qd = o.data?.queues || {};
  const nav = [
    { href: "/admin", label: "Analytics", icon: BarChart3 },
    { href: "/admin/orders", label: "Escrow & disputes", icon: Gavel, badge: qd.disputes },
    { href: "/admin/listings", label: "Listing approvals", icon: LayoutList, badge: qd.listings },
    { href: "/admin/kyc", label: "KYC reviews", icon: IdCard, badge: qd.kyc },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, badge: qd.withdrawals },
    { href: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine, badge: qd.deposits },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/reports", label: "Reports", icon: Flag, badge: qd.reports },
    { href: "/admin/support", label: "Support", icon: LifeBuoy, badge: (qd.tickets || 0) + (qd.deletions || 0) },
    { href: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
    { href: "/admin/audit", label: "Audit log", icon: History },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ];
  return (
    <Shell nav={nav} ready={!!me} title="Admin & escrow">
      {children}
    </Shell>
  );
}
