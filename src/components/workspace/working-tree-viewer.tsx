"use client";

import { RiArrowLeftLine } from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FileTree } from "@/components/workspace/file-tree";
import { WorkingDiff } from "@/components/workspace/working-diff";
import type { TreeNode } from "@/lib/file-tree";

/**
 * Working-tree diff with client-side file switching. The file tree is loaded
 * once on the server; selecting a file just changes WorkingDiff's `file` prop,
 * which refetches that one diff — no route navigation, no re-running getStatus.
 */
export function WorkingTreeViewer({
  nodes,
  fileCount,
  initialFile,
}: {
  nodes: TreeNode[];
  fileCount: number;
  initialFile: string | null;
}) {
  const [selected, setSelected] = useState(initialFile);

  return (
    <div className="bg-background flex h-screen flex-col">
      <header className="border-border bg-card flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <RiArrowLeftLine />
            Back to repository
          </Link>
        </Button>

        <span className="text-xs font-medium">Working tree changes</span>
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {fileCount} files changed
        </span>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel
          defaultSize="24%"
          minSize="15%"
          maxSize="45%"
          className="relative"
        >
          <ScrollArea className="bg-sidebar inset-0 h-full">
            <FileTree
              nodes={nodes}
              selected={selected}
              wt
              onSelect={setSelected}
            />
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="76%" className="relative">
          <div className="absolute inset-0">
            {selected ? (
              <WorkingDiff file={selected} />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                No changes in the working tree.
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
