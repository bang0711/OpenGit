"use client";

import {
  RiArrowGoBackLine,
  RiFileCopyLine,
  RiGitBranchLine,
  RiGitCommitLine,
  RiGitMergeLine,
  RiHistoryLine,
  RiPriceTag3Line,
  RiScissorsCutLine,
} from "@remixicon/react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  type ActionState,
  checkoutCommit,
  cherryPick,
  resetToCommit,
  revertCommit,
} from "@/app/actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { GraphRow } from "@/lib/graph";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { ROW_H } from ".";
import { GraphCell } from "./graph-cell";
import { RefBadge } from "./ref-badge";

export function CommitRow({
  row,
  graphWidth,
  selected,
  onSelect,
  onCreate,
  onRebase,
}: {
  row: GraphRow;
  graphWidth: number;
  selected: boolean;
  onSelect: () => void;
  onCreate: (kind: "branch" | "tag", sha: string) => void;
  onRebase: (sha: string) => void;
}) {
  const { commit } = row;
  const [pending, startTransition] = useTransition();
  const short = commit.shortSha;

  const run = (action: () => Promise<ActionState>, success: string) =>
    startTransition(async () => {
      notify(await action(), success);
    });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "border-border/40 hover:bg-muted/40 flex min-w-full cursor-pointer items-center border-b text-left text-xs",
            selected &&
              "bg-primary/10 shadow-[inset_2px_0_0_0_var(--primary)] hover:bg-primary/10",
            pending && "opacity-60",
          )}
          style={{ height: ROW_H }}
        >
          <GraphCell row={row} width={graphWidth} />
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
            <div className="flex shrink-0 gap-1">
              {commit.refs.map((ref) => (
                <RefBadge key={ref} refName={ref} />
              ))}
            </div>
            <span className="text-foreground truncate">{commit.subject}</span>
            <span className="text-muted-foreground ml-auto shrink-0 truncate">
              {commit.authorName}
            </span>
            <span className="text-muted-foreground shrink-0 font-mono text-[0.625rem]">
              {short}
            </span>
            <span className="text-muted-foreground shrink-0 text-right text-[0.625rem] whitespace-nowrap">
              {formatDate(commit.date)} ({relativeTime(commit.date)})
            </span>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem
          onSelect={() =>
            run(() => checkoutCommit(commit.sha), `Checked out ${short}`)
          }
        >
          <RiGitCommitLine className="mr-2 size-3.5" />
          Checkout commit {short}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            run(() => cherryPick(commit.sha), `Cherry-picked ${short}`)
          }
        >
          <RiScissorsCutLine className="mr-2 size-3.5" />
          Cherry-pick
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            run(() => revertCommit(commit.sha), `Reverted ${short}`)
          }
        >
          <RiArrowGoBackLine className="mr-2 size-3.5" />
          Revert commit
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <RiHistoryLine className="mr-2 size-3.5" />
            Reset {row.commit.refs.length ? "branch " : ""}to here
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onSelect={() =>
                run(
                  () => resetToCommit(commit.sha, "soft"),
                  `Soft reset to ${short}`,
                )
              }
            >
              Soft — keep changes staged
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                run(
                  () => resetToCommit(commit.sha, "mixed"),
                  `Mixed reset to ${short}`,
                )
              }
            >
              Mixed — keep changes unstaged
            </ContextMenuItem>
            <ContextMenuItem
              className="text-destructive"
              onSelect={() =>
                run(
                  () => resetToCommit(commit.sha, "hard"),
                  `Hard reset to ${short}`,
                )
              }
            >
              Hard — discard changes
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem onSelect={() => onRebase(commit.sha)}>
          <RiGitMergeLine className="mr-2 size-3.5" />
          Rebase commits after this…
        </ContextMenuItem>

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCreate("branch", commit.sha)}>
          <RiGitBranchLine className="mr-2 size-3.5" />
          Create branch here…
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCreate("tag", commit.sha)}>
          <RiPriceTag3Line className="mr-2 size-3.5" />
          Create tag here…
        </ContextMenuItem>

        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(commit.sha);
            toast.success("Copied commit SHA");
          }}
        >
          <RiFileCopyLine className="mr-2 size-3.5" />
          Copy commit SHA
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
}
