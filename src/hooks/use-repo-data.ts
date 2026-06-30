import { useCallback, useEffect, useState } from "react";

/**
 * Fetch some repo-scoped data once on mount and again whenever the backend
 * watcher fires `repo:changed`. `fetcher` must be a stable reference (e.g. an
 * action exported from `@/app/actions`). Returns the latest value + a manual
 * reload (for mutations the file watcher doesn't catch, like worktrees).
 */
export function useRepoData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    fetcher().then(setData);
  }, [fetcher]);
  useEffect(() => {
    reload();
    return window.api.onRepoChange(reload);
  }, [reload]);
  return { data, reload };
}
