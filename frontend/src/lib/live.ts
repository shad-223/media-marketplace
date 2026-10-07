"use client";

import { useEffect, useRef, useState } from "react";

import { getTokens } from "./api";

/** ws(s)://<this host>, or NEXT_PUBLIC_WS_ORIGIN in local dev where Next can't proxy upgrades. */
function wsOrigin() {
  if (process.env.NEXT_PUBLIC_WS_ORIGIN) return process.env.NEXT_PUBLIC_WS_ORIGIN;
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
}

/**
 * Subscribes to a server push channel (e.g. "/ws/orders/12/") and calls onEvent for every JSON event.
 * Reconnects with exponential backoff. Returns whether the socket is currently open, so callers can
 * fall back to polling while it isn't. Pass null to stay disconnected.
 */
export function useLiveChannel(path: string | null, onEvent: (event: any) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!path || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const open = () => {
      const token = getTokens()?.access;
      if (!token) return;
      ws = new WebSocket(`${wsOrigin()}${path}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (m) => {
        try {
          handler.current(JSON.parse(m.data));
        } catch {}
      };
      ws.onclose = (e) => {
        setConnected(false);
        if (stopped || e.code === 4403) return; // forbidden: retrying won't help
        // 4401 usually means the access token expired; REST calls refresh it meanwhile.
        const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500;
        timer = setTimeout(open, delay);
      };
    };

    open();
    const onAuth = () => {
      ws?.close();
    };
    window.addEventListener("media-auth", onAuth);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("media-auth", onAuth);
      ws?.close();
      setConnected(false);
    };
  }, [path]);

  return connected;
}
