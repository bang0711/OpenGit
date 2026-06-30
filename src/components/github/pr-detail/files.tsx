"use client";

import type { PrFile } from "@shared/types";
import { useState } from "react";
import { ActionTooltip } from "@/components/action-tooltip";
import { DiffStat } from "@/components/shared/diff-stat";
import { FileIcon } from "@/components/shared/file-icon";
import { splitRepoPath } from "@/lib/repo-path";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DiffPane } from "@/components/workspace/commit-diff-viewer/diff-pane";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  added: "text-[#3fb950]",
  removed: "text-[#f85149]",
  modified: "text-amber-500",
  renamed: "text-[#8be9fd]",
};

export function FilesChanged({
  files,
  base,
  head,
}: {
  files: PrFile[];
  base: string;
  head: string;
}) {
  const [sel, setSel] = useState(files[0]?.path ?? "");
  const file = files.find((f) => f.path === sel) ?? files[0] ?? null;

  if (files.length === 0)
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        No files changed.
      </div>
    );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel
        defaultSize="28%"
        minSize="18%"
        maxSize="45%"
        className="relative"
      >
        <ScrollArea className="bg-sidebar inset-0 h-full">
          {files.map((f) => {
            // GitLens-style: filename first, dimmed parent folder beside it.
            const { name, location } = splitRepoPath(f.path);
            const dir = location === f.path ? "" : location;
            return (
              <ActionTooltip key={f.path} label={f.path} side="right">
              <button
                type="button"
                onClick={() => setSel(f.path)}
                className={cn(
                  "flex w-full items-center gap-1.5 px-2 py-1 text-left text-[0.7rem] transition-colors",
                  f.path === file?.path ? "bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "w-3 shrink-0 text-center font-mono font-semibold",
                    STATUS_COLOR[f.status] ?? "text-muted-foreground",
                  )}
                >
                  {(f.status[0] ?? "?").toUpperCase()}
                </span>
                <FileIcon name={f.path} className="size-3.5" />
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="truncate font-medium">{name}</span>
                  {dir ? (
                    <span className="text-muted-foreground truncate text-[0.625rem]">
                      {dir}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0">
                  <DiffStat adds={f.additions} dels={f.deletions} />
                </span>
              </button>
              </ActionTooltip>
            );
          })}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize="72%" className="relative">
        <div className="absolute inset-0 flex flex-col">
          <DiffPane
            patch={file?.patch ?? null}
            file={file?.path ?? null}
            pending={false}
            error={null}
            oldLabel={base}
            newLabel={head}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
