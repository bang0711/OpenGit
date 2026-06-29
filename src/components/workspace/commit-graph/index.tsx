"use client";

import { RiSearchLine } from "@remixicon/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState, useTransition } from "react";
import { createBranchAt, createTagAt } from "@/app/actions";
import { NameDialog } from "@/components/name-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RebaseDialog } from "@/components/workspace/rebase-dialog";
import type { Commit } from "@/lib/git";
import { buildGraph } from "@/lib/graph";
import { notify } from "@/lib/notify";
import { CommitRow } from "./commit-row";

type CreateTarget = { kind: "branch" | "tag"; sha: string };

export const ROW_H = 32;
const GAP = 16;
const PAD = 14;
export const laneX = (i: number) => PAD + i * GAP;

export function CommitGraph({
  commits,
  selected,
  onSelect,
}: {
  commits: Commit[];
  selected: string | null;
  onSelect: (sha: string) => void;
}) {
  const [create, setCreate] = useState<CreateTarget | null>(null);
  const [rebaseBase, setRebaseBase] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commits;
    return commits.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.authorName.toLowerCase().includes(q) ||
        c.sha.toLowerCase().includes(q),
    );
  }, [commits, query]);

  const { rows, width } = useMemo(() => buildGraph(shown), [shown]);
  const graphWidth = laneX(Math.max(width, 1));

  // Virtualize: render only the rows in view. Big repos (1000s of commits) keep
  // the DOM tiny instead of mounting every row.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const onCreateSubmit = (name: string) => {
    if (!create) return;
    const action =
      create.kind === "branch"
        ? () => createBranchAt(name, create.sha)
        : () => createTagAt(name, create.sha);
    startTransition(async () => {
      notify(await action(), `Created ${create.kind} ${name}`);
    });
  };

  return (
    <div className="bg-background flex h-full flex-col">
      <div className="border-border text-muted-foreground flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs font-semibold">
        History
        <span className="font-normal">{shown.length} commits</span>
        <div className="relative ml-auto">
          <RiSearchLine className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commits…"
            className="h-6 w-48 pl-6 text-xs"
          />
        </div>
      </div>

      {commits.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
          No commits yet.
        </div>
      ) : shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
          No commits match “{query}”.
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportRef={scrollRef}>
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              return (
                <div
                  key={row.commit.sha}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <CommitRow
                    row={row}
                    graphWidth={graphWidth}
                    selected={selected === row.commit.sha}
                    onSelect={() => onSelect(row.commit.sha)}
                    onCreate={(kind, sha) => setCreate({ kind, sha })}
                    onRebase={(sha) => setRebaseBase(sha)}
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      <NameDialog
        open={!!create}
        onOpenChange={(o) => !o && setCreate(null)}
        title={create?.kind === "tag" ? "Create tag" : "Create branch"}
        label={create?.kind === "tag" ? "Tag name" : "Branch name"}
        placeholder={create?.kind === "tag" ? "v1.0.0" : "feature/x"}
        onSubmit={onCreateSubmit}
      />

      <RebaseDialog base={rebaseBase} onClose={() => setRebaseBase(null)} />
    </div>
  );
}
