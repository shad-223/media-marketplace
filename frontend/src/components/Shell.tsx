"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Spinner } from "./ui";

export type NavItem = { href: string; label: string; icon: any; badge?: number };

/** Sidebar on desktop, horizontal scroll chips on phones. */
export function Shell({ nav, children, ready, title }: { nav: NavItem[]; children: React.ReactNode; ready: boolean; title?: string }) {
  const path = usePathname();
  const active = (href: string) => (href === nav[0].href ? path === href : path.startsWith(href));
  if (!ready) return <Spinner className="py-32" />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:flex lg:gap-8 lg:py-8">
      <aside className="hidden w-56 shrink-0 lg:block">
        {title && <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wider text-ink-mute">{title}</p>}
        <nav className="sticky top-24 space-y-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active(n.href) ? "bg-white text-brand-700 shadow-card" : "text-ink-soft hover:bg-white/70 hover:text-ink",
              )}
            >
              <n.icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{n.badge}</span>}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:hidden">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
              active(n.href) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-ink-soft",
            )}
          >
            <n.icon className="h-4 w-4" /> {n.label}
            {!!n.badge && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{n.badge}</span>}
          </Link>
        ))}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
