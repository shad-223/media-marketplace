"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, LayoutDashboard, LogOut, Menu, Plus, Search, Shield, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveChannel } from "@/lib/live";

import { btnClass } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={clsx("flex items-center gap-2", className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-md shadow-brand-500/30">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-ink">
        Media<span className="text-brand-600">.</span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/contest", label: "Contest" },
  { href: "/dashboard", label: "Dashboard" },
];

export function NoticeBar() {
  return (
    <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-white/90">
      🔒 Every trade is protected by Media Escrow — money is released only after you confirm the handover.{" "}
      <Link href="/tutorial" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
        How it works →
      </Link>
    </div>
  );
}

export function Header() {
  const { me, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => setOpen(false), [path]);

  const qc = useQueryClient();
  const live = useLiveChannel(me ? "/ws/notifications/" : null, (ev) => {
    if (typeof ev.unread === "number") qc.setQueryData(["notifications"], (old: any) => (old ? { ...old, unread: ev.unread } : old));
    if (ev.event === "notification") {
      // Something happened to this user (sale, offer, payout…) — refresh what the dashboard shows.
      for (const key of ["notifications", "summary", "orders", "offers", "deposits", "withdrawals", "kyc", "me", "my-listings"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    }
  });
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications/"),
    enabled: !!me,
    refetchInterval: live ? false : 60_000,
  });
  const unread = notes.data?.unread || 0;

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/marketplace${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                (n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "text-brand-700 bg-brand-50" : "text-ink-soft hover:text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <form onSubmit={search} className="ml-auto hidden max-w-xs flex-1 md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search channels, sites, apps…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-300 focus:bg-white focus:outline-none"
            />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link href="/dashboard/listings/new" className={btnClass("primary", "md", "hidden sm:inline-flex")}>
            <Plus className="h-4 w-4" /> Sell
          </Link>
          {me ? (
            <>
              <Link href="/dashboard/notifications" className="relative rounded-xl p-2 text-ink-soft hover:bg-slate-100" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span>
                )}
              </Link>
              {me.is_staff && (
                <Link href="/admin" className="hidden rounded-xl p-2 text-ink-soft hover:bg-slate-100 sm:block" aria-label="Admin" title="Admin & escrow">
                  <Shield className="h-5 w-5" />
                </Link>
              )}
              <Link href="/dashboard" className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold uppercase text-brand-700 sm:flex" title={me.username}>
                {me.username.slice(0, 2)}
              </Link>
            </>
          ) : me === null ? (
            <>
              <Link href="/login" className={btnClass("ghost", "md", "hidden sm:inline-flex")}>
                Log in
              </Link>
              <Link href="/register" className={btnClass("secondary", "md")}>
                Sign up
              </Link>
            </>
          ) : null}
          <button onClick={() => setOpen(!open)} className="rounded-xl p-2 text-ink lg:hidden" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 lg:hidden">
          <form onSubmit={search} className="mb-2 md:hidden">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          </form>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 font-medium text-ink hover:bg-slate-50">
              {n.label}
            </Link>
          ))}
          <Link href="/dashboard/listings/new" className="block rounded-lg px-3 py-2.5 font-semibold text-brand-700">
            + Sell an asset
          </Link>
          {me?.is_staff && (
            <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium text-ink">
              <Shield className="h-4 w-4" /> Admin & escrow
            </Link>
          )}
          {me ? (
            <button onClick={() => (logout(), router.push("/"))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-medium text-rose-600">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          ) : (
            <Link href="/login" className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium text-ink">
              <LayoutDashboard className="h-4 w-4" /> Log in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-ink-soft">The safe way to buy and sell YouTube channels, pages, websites, apps and domains — protected by escrow.</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Marketplace</p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/marketplace?group=social">Social media</Link></li>
            <li><Link href="/marketplace?group=web">Websites & apps</Link></li>
            <li><Link href="/marketplace?group=gaming">Gaming accounts</Link></li>
            <li><Link href="/marketplace?group=services">SaaS & stores</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Learn</p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/tutorial">How escrow works</Link></li>
            <li><Link href="/tutorial#selling">Selling guide</Link></li>
            <li><Link href="/contest">Contest</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Pay with</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {["bKash", "Nagad", "Rocket", "Bank", "Card / USD"].map((m) => (
              <span key={m} className="rounded-lg border border-slate-200 px-2.5 py-1 text-ink-soft">{m}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="border-t border-slate-100 py-5 text-center text-xs text-ink-mute">© {new Date().getFullYear()} Media. All rights reserved.</p>
    </footer>
  );
}
