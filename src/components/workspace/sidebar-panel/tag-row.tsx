"use client";

import { RiDeleteBinLine, RiPriceTag3Line } from "@remixicon/react";
import { useState } from "react";
import { deleteRemoteTag, deleteTag } from "@/app/actions";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Tag } from "@/lib/git";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export function TagRow({ tag }: { tag: Tag }) {
  const [pending, setPending] = useState(false);

  const run = (fn: () => Promise<{ error?: string }>, success: string) => {
    if (pending) return;
    setPending(true);
    fn()
      .then((r) => notify(r, success))
      .finally(() => setPending(false));
  };

  const onDelete = () => run(() => deleteTag(tag.name), `Deleted tag ${tag.name}`);
  const onDeleteRemote = () =>
    run(() => deleteRemoteTag(tag.name), `Deleted ${tag.name} from origin`);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group hover:bg-sidebar-accent flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs",
            pending && "opacity-60",
          )}
        >
          <RiPriceTag3Line className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate">{tag.name}</span>
          <span className="text-muted-foreground ml-auto font-mono text-[0.625rem]">
            {tag.sha}
          </span>
          <ActionTooltip side="right" label="Delete tag">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              onClick={onDelete}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
            >
              <RiDeleteBinLine />
            </Button>
          </ActionTooltip>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          className="text-destructive"
          disabled={pending}
          onSelect={onDelete}
        >
          Delete tag
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive"
          disabled={pending}
          onSelect={onDeleteRemote}
        >
          Delete on remote (origin)
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

