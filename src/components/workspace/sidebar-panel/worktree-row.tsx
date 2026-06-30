"use client";

import { RiCheckLine, RiFolderLine } from "@remixicon/react";
import { useState } from "react";
import { worktreePrune, worktreeRemove } from "@/app/actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Worktree } from "@/lib/git";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export function WorktreeRow({
  wt,
  onChanged,
}: {
  wt: Worktree;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const run = (fn: () => Promise<{ error?: string }>, success: string) => {
    if (pending) return;
    setPending(true);
    fn()
      .then((r) => {
        notify(r, success);
        if (!("error" in r)) onChanged();
      })
      .finally(() => setPending(false));
  };

  const label =
    wt.branch ?? (wt.detached ? `detached @ ${wt.head.slice(0, 7)}` : wt.head.slice(0, 7));
  const name = wt.path.replace(/\\/g, "/").split("/").pop() || wt.path;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          title={`${wt.path}\n${label}`}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs hover:bg-sidebar-accent",
            pending && "opacity-60",
          )}
        >
          <RiFolderLine className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
          <span className="ml-auto truncate text-[0.625rem] text-muted-foreground">
            {label}
          </span>
          {wt.isCurrent ? (
            <RiCheckLine className="size-3.5 shrink-0 text-primary" />
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          disabled={wt.isMain || wt.isCurrent}
          onSelect={() =>
            run(() => worktreeRemove(wt.path), "Worktree removed")
          }
        >
          Remove
        </ContextMenuItem>
        <ContextMenuItem
          disabled={wt.isMain || wt.isCurrent}
          className="text-destructive"
          onSelect={() =>
            run(() => worktreeRemove(wt.path, true), "Worktree force-removed")
          }
        >
          Force remove
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => run(() => worktreePrune(), "Pruned worktrees")}
        >
          Prune stale
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
