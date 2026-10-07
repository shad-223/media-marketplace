"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { api, getTokens, setTokens } from "./api";

export type Me = {
  id: number;
  username: string;
  email: string;
  phone: string;
  bio: string;
  kyc_status: "none" | "pending" | "verified" | "rejected";
  is_verified: boolean;
  is_staff: boolean;
  rating: { average: number; count: number };
  completed_trades: number;
  date_joined: string;
};

type Ctx = {
  me: Me | null | undefined; // undefined = loading
  login: (email: string, password: string) => Promise<Me>;
  register: (d: Record<string, string>) => Promise<Me>;
  logout: () => void;
};

const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setHasToken(!!getTokens());
    sync();
    window.addEventListener("media-auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("media-auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me/"),
    enabled: !!hasToken,
    retry: false,
    staleTime: 60_000,
  });

  const me = hasToken === null ? undefined : !hasToken ? null : q.isLoading ? undefined : q.data ?? null;

  async function finish(d: any) {
    setTokens({ access: d.access, refresh: d.refresh });
    qc.setQueryData(["me"], d.user);
    return d.user as Me;
  }

  const value: Ctx = {
    me,
    login: (email, password) => api("/auth/login/", { body: { email, password } }).then(finish),
    register: (d) => api("/auth/register/", { body: d }).then(finish),
    logout: () => {
      setTokens(null);
      qc.clear();
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Redirects to /login when signed out; returns the user once known. */
export function useRequireAuth(staff = false) {
  const { me } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (me === null) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    else if (me && staff && !me.is_staff) router.replace("/dashboard");
  }, [me, staff, router]);
  return me && (!staff || me.is_staff) ? me : null;
}
