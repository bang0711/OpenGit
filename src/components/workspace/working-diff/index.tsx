"use client";

import {
  RiGitCommitLine,
  RiHistoryLine,
  RiLoader4Line,
} from "@remixicon/react";
import { isImagePath } from "@shared/image";
import { useEffect, useState, useTransition } from "react";
import {
  applyLines,
  fileHunkDiffs,
  revertHunk,
  revertWorkingHunk,
  stageHunk,
  stageWorkingHunk,
  unstageHunk,
  workingFileDiff,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { WorkingImageDiff } from "@/components/workspace/image-diff";
import { usePersistedState } from "@/hooks/use-persisted-state";
import Link from "@/lib/link";
import { notify } from "@/lib/notify";
import { useRouter } from "@/lib/router";
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

  const isImage = isImagePath(file);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` is a manual refetch trigger
  useEffect(() => {
    if (isImage) return; // images load via WorkingImageDiff, not a text patch
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

  // Event-driven refresh: refetch when the repo changes on disk (chokidar→IPC),
  // same signal the changes sidebar uses.
  useEffect(() => window.api.onRepoChange(() => setRev((v) => v + 1)), []);

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
      <div className="border-border bg-card flex h-8 shrink-0 items-center gap-2 border-b px-3 font-mono text-xs">
        <span className="truncate">{file}</span>
        {pending ? <RiLoader4Line className="size-3.5 animate-spin" /> : null}
        <div className="ml-auto flex items-center gap-1">
          {!isImage && <ViewToggle view={view} onChange={setView} />}
          <Button asChild variant="ghost" size="xs">
            <Link href={{ pathname: "/blame", query: { file } }}>
              <RiHistoryLine /> Blame
            </Link>
          </Button>
          <Button asChild variant="ghost" size="xs">
            <Link href={{ pathname: "/file-history", query: { file } }}>
              <RiGitCommitLine /> History
            </Link>
          </Button>
        </div>
      </div>

      {isImage ? (
        <WorkingImageDiff file={file} />
      ) : error ? (
        <p className="text-destructive p-3 text-xs">{error}</p>
      ) : view === "split" ? (
        <SplitView
          patch={patch}
          file={file}
          onStageHunk={(i) =>
            act(() => stageWorkingHunk(file, i), "Staged hunk")
          }
          onRevertHunk={(i) =>
            act(() => revertWorkingHunk(file, i), "Reverted hunk")
          }
          onApplyLines={(lines, mode) =>
            act(
              () => applyLines(file, lines, mode),
              mode === "stage" ? "Staged lines" : "Discarded lines",
            )
          }
        />
      ) : (
        <UnifiedView
          hunks={hunks}
          pending={pending}
          onStage={(i) => act(() => stageHunk(file, i), "Staged hunk")}
          onUnstage={(i) => act(() => unstageHunk(file, i), "Unstaged hunk")}
          onRevert={(i) => act(() => revertHunk(file, i), "Reverted hunk")}
        />
      )}
    </div>
  );
}
