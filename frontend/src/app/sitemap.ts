import type { MetadataRoute } from "next";

const BASE = "https://media.bpda.site";
const API = process.env.API_ORIGIN || "http://127.0.0.1:8010";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/marketplace", "/tutorial", "/contest"].map((p) => ({ url: BASE + p, changeFrequency: "daily" as const }));
  try {
    const res = await fetch(`${API}/api/listings/?page_size=100`, { next: { revalidate: 3600 } });
    const data = await res.json();
    return [...pages, ...data.results.map((l: { id: number; approved_at: string }) => ({ url: `${BASE}/listings/${l.id}`, lastModified: l.approved_at }))];
  } catch {
    return pages;
  }
}
