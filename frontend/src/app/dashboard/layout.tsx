"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bell, Bookmark, Gavel, Home, IdCard, LayoutList, ReceiptText, Settings, ShoppingCart, Wallet } from "lucide-react";

import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = useRequireAuth();
  const s = useQuery({ queryKey: ["summary"], queryFn: () => api("/wallet/summary/"), enabled: !!me, refetchInterval: 30_000 });
  const n = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications/"), enabled: !!me });
  const nav = [
    { href: "/dashboard", label: "Overview", icon: Home },
    { href: "/dashboard/orders", label: "Orders & escrow", icon: ShoppingCart, badge: (s.data?.active_purchases || 0) + (s.data?.active_sales || 0) },
    { href: "/dashboard/listings", label: "My listings", icon: LayoutList },
    { href: "/dashboard/bids", label: "Bids & offers", icon: Gavel, badge: s.data?.offers_received },
    { href: "/dashboard/saved", label: "Saved", icon: Bookmark },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
    { href: "/dashboard/analytics", label: "Seller analytics", icon: BarChart3 },
    { href: "/dashboard/transactions", label: "Transactions", icon: ReceiptText },
    { href: "/dashboard/kyc", label: "Verify identity", icon: IdCard },
    { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badge: n.data?.unread },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  return (
    <Shell nav={nav} ready={!!me} title="Dashboard">
      {children}
    </Shell>
  );
}
