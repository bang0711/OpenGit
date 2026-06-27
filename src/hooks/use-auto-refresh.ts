"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keep the page's server-component data in sync with on-disk repo state.
 *
 * Event-driven: the server watches the repo (fs.watch) and pushes a debounced
 * "change" over SSE (`/api/watch`); we refresh on it. No polling. Focus /
 * visibility refresh is kept as a cheap fallback for the gaps the watcher can't
 * cover (e.g. Linux, where recursive fs.watch is unsupported, or a missed
 * event while the tab was hidden). `repoPath` re-subscribes on repo switch.
 */
export function useAutoRefresh(repoPath?: string) {
  const router = useRouter();
  // biome-ignore lint/correctness/useExhaustiveDependencies: repoPath re-subscribes the watcher on repo switch
  useEffect(() => {
    const refresh = () =>
      document.visibilityState === "visible" && router.refresh();

    const es = new EventSource("/api/watch");
    es.onmessage = (e) => {
      if (e.data === "change") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      es.close();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, repoPath]);
}
