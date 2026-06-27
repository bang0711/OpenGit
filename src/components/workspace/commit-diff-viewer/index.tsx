"use client";

import { RiArrowLeftLine, RiGitCommitLine } from "@remixicon/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { commitFileDiff } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FileTree } from "@/components/workspace/file-tree";
import type { TreeNode } from "@/lib/file-tree";
import { DiffPane } from "./diff-pane";

/**
 * Commit inspector with client-side file switching. The commit detail (file
 * tree + meta) is loaded once on the server; clicking a file fetches only that
 * file's diff via a server action and swaps the pane — no route navigation, no
 * re-running getCommitDetail. Diffs are cached so re-clicks are instant.
 */
export function CommitDiffViewer({
  sha,
  nodes,
  subject,
  shortSha,
  parentSha,
  fileCount,
  initialFile,
  initialDiff,
}: {
  sha: string;
  nodes: TreeNode[];
  subject: string;
  shortSha: string;
  parentSha: string | null;
  fileCount: number;
  initialFile: string | null;
  initialDiff: string | null;
}) {
  const [selected, setSelected] = useState(initialFile);
  const [patch, setPatch] = useState<string | null>(initialDiff);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(
    new Map<string, string>(
      initialFile && initialDiff !== null ? [[initialFile, initialDiff]] : [],
    ),
  );

  useEffect(() => {
    if (!selected) return;
    const cached = cache.current.get(selected);
    if (cached !== undefined) {
      setPatch(cached);
      setError(null);
      return;
    }
    let live = true;
    setPending(true);
    commitFileDiff(sha, selected)
      .then((r) => {
        if (!live) return;
        if ("error" in r) {
          setError(r.error);
          setPatch(null);
        } else {
          cache.current.set(selected, r.diff);
          setPatch(r.diff);
          setError(null);
        }
      })
      .finally(() => live && setPending(false));
    return () => {
      live = false;
    };
  }, [selected, sha]);

  const newLabel = `${subject} · ${shortSha}`;
  const oldLabel = parentSha
    ? `parent · ${parentSha.slice(0, 7)}`
    : "Added in this commit";

  return (
    <div className="bg-background flex h-screen flex-col">
      <header className="border-border bg-card flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <RiArrowLeftLine />
            Back to repository
          </Link>
        </Button>

        <div className="flex min-w-0 items-center gap-2 text-xs">
          <RiGitCommitLine className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate font-medium">{subject}</span>
          <span className="text-muted-foreground shrink-0 font-mono">
            {shortSha}
          </span>
        </div>
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
              onSelect={setSelected}
            />
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="76%" className="relative">
          <div className="absolute inset-0 flex flex-col">
            <DiffPane
              patch={patch}
              pending={pending}
              error={error}
              file={selected}
              oldLabel={oldLabel}
              newLabel={newLabel}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
