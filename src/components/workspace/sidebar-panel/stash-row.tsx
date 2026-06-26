"use client";

import { RiInboxArchiveLine } from "@remixicon/react";
import { useState } from "react";
import { stashApply, stashDrop, stashPop } from "@/app/actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Stash } from "@/lib/git";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export function StashRow({ stash }: { stash: Stash }) {
  const [pending, setPending] = useState(false);
  const run = (fn: () => Promise<{ error?: string }>, success: string) => {
    if (pending) return;
    setPending(true);
    fn()
      .then((r) => notify(r, success))
      .finally(() => setPending(false));
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          title={`${stash.ref}\n${stash.message}`}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs hover:bg-sidebar-accent",
            pending && "opacity-60",
          )}
        >
          <RiInboxArchiveLine className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{stash.message}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onSelect={() => run(() => stashApply(stash.ref), "Stash applied")}
        >
          Apply
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => run(() => stashPop(stash.ref), "Stash popped")}
        >
          Pop (apply &amp; drop)
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive"
          onSelect={() => run(() => stashDrop(stash.ref), "Stash dropped")}
        >
          Drop
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
