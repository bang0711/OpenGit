"use client";

import { useEffect, useRef, useState } from "react";

export type RealtimeStatus = "off" | "connecting" | "live" | "error";

/**
 * Subscribe to a self-hosted webhook relay over WebSocket and call `onEvent`
 * whenever the relay pushes a GitHub event for `repo`. No-op (status "off") when
 * `relayUrl` or `repo` is empty. Reconnects with capped backoff.
 *
 * `relayUrl` is the relay base (e.g. https://host or host:8787); it's normalized
 * to `ws(s)://host/ws?repo=owner/repo`.
 */
export function useRealtime(
  relayUrl: string,
  repo: string,
  onEvent: () => void,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("off");
  // Keep the latest callback without resubscribing on every render.
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!relayUrl.trim() || !repo) {
      setStatus("off");
      return;
    }

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const wsUrl = (() => {
      try {
        const u = new URL(
          relayUrl.includes("://") ? relayUrl : `https://${relayUrl}`,
        );
        u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
        u.pathname = "/ws";
        u.search = `?repo=${encodeURIComponent(repo)}`;
        return u.toString();
      } catch {
        return "";
      }
    })();

    if (!wsUrl) {
      setStatus("error");
      return;
    }

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        attempt = 0;
        setStatus("live");
      };
      ws.onmessage = () => cb.current();
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        if (closed) return;
        setStatus("error");
        attempt += 1;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
        retry = setTimeout(connect, delay);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [relayUrl, repo]);

  return status;
}
