"use client";

const KEY = "media.auth";

export type Tokens = { access: string; refresh: string };

export function getTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function setTokens(t: Tokens | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("media-auth"));
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(errorText(data) || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

/** Flattens DRF error payloads into one readable sentence. */
export function errorText(data: any): string {
  if (!data) return "";
  if (typeof data === "string") return data.slice(0, 200);
  if (Array.isArray(data)) return data.map(errorText).join(" ");
  if (data.detail) return errorText(data.detail);
  return Object.entries(data)
    .map(([k, v]) => (k === "non_field_errors" ? errorText(v) : `${k.replace(/_/g, " ")}: ${errorText(v)}`))
    .join(" · ");
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const t = getTokens();
  if (!t?.refresh) return false;
  refreshing ??= fetch("/api/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: t.refresh }),
  })
    .then(async (r) => {
      if (!r.ok) {
        setTokens(null);
        return false;
      }
      const d = await r.json();
      setTokens({ access: d.access, refresh: d.refresh || t.refresh });
      return true;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

type Opts = { method?: string; body?: any; raw?: boolean };

export async function api<T = any>(path: string, opts: Opts = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  const t = getTokens();
  if (t?.access) headers.Authorization = `Bearer ${t.access}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  if (res.status === 401 && retry && t?.refresh && (await refresh())) return api<T>(path, opts, false);
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, null);
    return res as any;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Opens a protected file (KYC doc, proof, chat attachment) in a new tab. */
export async function openProtectedFile(path: string) {
  const win = window.open("", "_blank");
  try {
    const res: Response = await api(path, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
  } catch (e) {
    win?.close();
    alert((e as Error).message);
  }
}
