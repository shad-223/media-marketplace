import clsx from "clsx";
import {
  AtSign, Cloud, Crosshair, Facebook, Gamepad2, Globe, Instagram, Music2, Send, ShoppingBag, Smartphone, Twitter, Youtube,
} from "lucide-react";

export const PLATFORMS: Record<string, { label: string; short: string; icon: any; color: string; bg: string; metric: string }> = {
  youtube: { label: "YouTube Channel", short: "YouTube", icon: Youtube, color: "text-red-600", bg: "from-red-500 to-rose-600", metric: "Subscribers" },
  facebook: { label: "Facebook Page / Group", short: "Facebook", icon: Facebook, color: "text-blue-600", bg: "from-blue-500 to-indigo-600", metric: "Followers" },
  instagram: { label: "Instagram Account", short: "Instagram", icon: Instagram, color: "text-pink-600", bg: "from-fuchsia-500 via-pink-500 to-orange-400", metric: "Followers" },
  tiktok: { label: "TikTok Account", short: "TikTok", icon: Music2, color: "text-slate-900", bg: "from-slate-900 via-slate-800 to-cyan-600", metric: "Followers" },
  x: { label: "X (Twitter) Account", short: "X", icon: Twitter, color: "text-slate-900", bg: "from-slate-800 to-slate-950", metric: "Followers" },
  telegram: { label: "Telegram Channel / Group", short: "Telegram", icon: Send, color: "text-sky-500", bg: "from-sky-400 to-blue-500", metric: "Members" },
  website: { label: "Website / Blog", short: "Website", icon: Globe, color: "text-emerald-600", bg: "from-emerald-500 to-teal-600", metric: "Visitors / mo" },
  app: { label: "Mobile App", short: "App", icon: Smartphone, color: "text-violet-600", bg: "from-violet-500 to-purple-600", metric: "Installs" },
  domain: { label: "Domain", short: "Domain", icon: AtSign, color: "text-amber-600", bg: "from-amber-400 to-orange-500", metric: "Age" },
  freefire: { label: "Free Fire Account", short: "Free Fire", icon: Gamepad2, color: "text-orange-600", bg: "from-orange-500 to-red-600", metric: "Level" },
  pubg: { label: "PUBG Account", short: "PUBG", icon: Crosshair, color: "text-yellow-700", bg: "from-yellow-500 to-amber-700", metric: "Tier" },
  saas: { label: "SaaS Product", short: "SaaS", icon: Cloud, color: "text-indigo-600", bg: "from-indigo-500 to-blue-600", metric: "Customers" },
  ecommerce: { label: "E-commerce Store", short: "Store", icon: ShoppingBag, color: "text-teal-600", bg: "from-teal-500 to-cyan-600", metric: "Visitors / mo" },
};

export const GROUPS = [
  { value: "social", label: "Social Media" },
  { value: "web", label: "Web & Apps" },
  { value: "gaming", label: "Gaming" },
  { value: "services", label: "SaaS & Stores" },
];

export function PlatformIcon({ category, className, boxed }: { category: string; className?: string; boxed?: boolean }) {
  const p = PLATFORMS[category] || PLATFORMS.website;
  const Icon = p.icon;
  if (boxed)
    return (
      <span className={clsx("inline-flex items-center justify-center rounded-xl bg-gradient-to-br text-white", p.bg, className || "h-10 w-10")}>
        <Icon className="h-1/2 w-1/2" />
      </span>
    );
  return <Icon className={clsx(p.color, className || "h-4 w-4")} />;
}

export const GROUP_OF: Record<string, string> = {
  youtube: "social", facebook: "social", instagram: "social", tiktok: "social", x: "social", telegram: "social",
  website: "web", app: "web", domain: "web", freefire: "gaming", pubg: "gaming", saas: "services", ecommerce: "services",
};
