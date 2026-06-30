"use client";

import { RiGitRepositoryLine } from "@remixicon/react";
import { useState } from "react";
import { submoduleSync, submoduleUpdate } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Submodule } from "@/lib/git";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<Submodule["state"], string | null> = {
  ok: null,
  uninitialized: "not init",
  modified: "modified",
  conflict: "conflict",
};

export function SubmoduleRow({
  submodule,
  onChanged,
}: {
  submodule: Submodule;
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

  const label = STATE_LABEL[submodule.state];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          title={`${submodule.path}\n${submodule.sha}${submodule.ref ? ` (${submodule.ref})` : ""}`}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs hover:bg-sidebar-accent",
            pending && "opacity-60",
          )}
        >
          <RiGitRepositoryLine className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{submodule.path}</span>
          {label ? (
            <Badge variant="secondary" className="ml-auto font-normal">
              {label}
            </Badge>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onSelect={() =>
            run(() => submoduleUpdate(submodule.path), "Submodule updated")
          }
        >
          Update (init)
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => run(() => submoduleSync(), "Submodules synced")}
        >
          Sync URLs
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
