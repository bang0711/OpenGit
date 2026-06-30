"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { repoHead } from "@/app/actions";
import { getSyncUI } from "@/lib/terminal-settings";

type Head = { head: string | null; commit: string | null };

/**
 * Toasts when the repo's HEAD or commit changes out-of-band — e.g. a `git`
 * command run in the in-app terminal (or any external tool). The file watcher
 * already refreshes the UI on repo:changed; this only adds the notification, and
 * only when HEAD/commit actually moved (so plain file edits don't spam).
 */
export function RepoChangeNotifier() {
  const last = useRef<Head | null>(null);

  useEffect(() => {
    return window.api.onRepoChange(async () => {
      const next = await repoHead();
      const prev = last.current;
      last.current = next;
      // Always track the baseline, but only notify when "Sync with UI" is on.
      if (!prev || !getSyncUI()) return;
      if (prev.head !== next.head) {
        toast.message("Repository updated", {
          description: next.head ? `Now on ${next.head}` : "Detached HEAD",
        });
      } else if (prev.commit !== next.commit) {
        toast.message("Repository updated", {
          description: next.head
            ? `New commit on ${next.head}${next.commit ? ` · ${next.commit}` : ""}`
            : `New commit${next.commit ? ` · ${next.commit}` : ""}`,
        });
      }
    });
  }, []);

  return null;
}
