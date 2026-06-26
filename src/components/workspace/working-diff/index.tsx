"use client";

import { RiHistoryLine, RiLoader4Line } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  fileHunkDiffs,
  stageHunk,
  unstageHunk,
  workingFileDiff,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { notify } from "@/lib/notify";
import { SplitView } from "./split-view";
import { UnifiedView } from "./unified-view";
import { ViewToggle } from "./view-toggle";

export type View = "split" | "unified";
export type HunkData = { unstaged: string; staged: string };

export function WorkingDiff({ file }: { file: string }) {
  const router = useRouter();
  const [view, setView] = usePersistedState<View>(
    "opengit.workingDiffView",
    "split",
  );
  const [hunks, setHunks] = useState<HunkData | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [pending, startTransition] = useTransition();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` is a manual refetch trigger
  useEffect(() => {
    startTransition(async () => {
      if (view === "unified") {
        const r = await fileHunkDiffs(file);
        if ("error" in r) setError(r.error);
        else {
          setError(null);
          setHunks(r);
        }
      } else {
        const r = await workingFileDiff(file);
        if ("error" in r) setError(r.error);
        else {
          setError(null);
          setPatch(r.diff);
        }
      }
    });
  }, [file, rev, view]);

  const act = (fn: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      const r = await fn();
      notify(r, success);
      if (!r?.error) {
        setRev((v) => v + 1);
        router.refresh();
      }
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-card px-3 font-mono text-xs">
        <span className="truncate">{file}</span>
        {pending ? <RiLoader4Line className="size-3.5 animate-spin" /> : null}
        <div className="ml-auto flex items-center gap-1">
          <ViewToggle view={view} onChange={setView} />
          <Button asChild variant="ghost" size="xs">
            <Link href={{ pathname: "/blame", query: { file } }}>
              <RiHistoryLine /> Blame
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="p-3 text-xs text-destructive">{error}</p>
      ) : view === "split" ? (
        <SplitView patch={patch} />
      ) : (
        <UnifiedView
          hunks={hunks}
          pending={pending}
          onStage={(i) => act(() => stageHunk(file, i), "Staged hunk")}
          onUnstage={(i) => act(() => unstageHunk(file, i), "Unstaged hunk")}
        />
      )}
    </div>
  );
}
