"use client";

import { RiAddLine, RiSubtractLine } from "@remixicon/react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { splitDiffIntoHunks } from "@/lib/diff";
import { Section } from "./hunk-section";
import type { HunkData } from "./index";

export function UnifiedView({
  hunks,
  pending,
  onStage,
  onUnstage,
}: {
  hunks: HunkData | null;
  pending: boolean;
  onStage: (index: number) => void;
  onUnstage: (index: number) => void;
}) {
  const staged = hunks ? splitDiffIntoHunks(hunks.staged).hunks : [];
  const unstaged = hunks ? splitDiffIntoHunks(hunks.unstaged).hunks : [];
  return (
    <ScrollArea className="min-h-0 flex-1">
      <Section
        title="Staged"
        empty="No staged changes."
        hunks={staged}
        actionLabel="Unstage"
        actionIcon={<RiSubtractLine />}
        pending={pending}
        onAction={onUnstage}
      />
      <Section
        title="Unstaged"
        empty="No unstaged changes."
        hunks={unstaged}
        actionLabel="Stage"
        actionIcon={<RiAddLine />}
        pending={pending}
        onAction={onStage}
      />
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
