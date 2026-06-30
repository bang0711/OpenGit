"use client";

import { RiAddLine, RiArrowGoBackLine, RiCloseLine } from "@remixicon/react";
import { useState } from "react";
import type { LineSelection } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared/notice";
import { SideBySideDiff } from "@/components/workspace/side-by-side-diff";
import { type DiffRow, parseUnifiedDiff } from "@/lib/diff";
import { langFromPath } from "@/lib/highlight";

// HEAD-vs-working-tree comparison, rendered like the commit inspector.
export function SplitView({
  patch,
  file,
  onStageHunk,
  onRevertHunk,
  onApplyLines,
}: {
  patch: string | null;
  file?: string;
  onStageHunk?: (index: number) => void;
  onRevertHunk?: (index: number) => void;
  onApplyLines?: (lines: LineSelection[], mode: "stage" | "discard") => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (patch === null) return null;
  const parsed = parseUnifiedDiff(patch);
  if (parsed.rows.length === 0) {
    return (
      <Notice className="text-sm">
        {parsed.binary ? "Binary file — no textual diff." : "No changes."}
      </Notice>
    );
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const apply = (mode: "stage" | "discard") => {
    const lines: LineSelection[] = [...selected].map((k) => ({
      add: k.startsWith("a:"),
      line: Number(k.slice(2)),
    }));
    onApplyLines?.(lines, mode);
    setSelected(new Set());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SideBySideDiff
        rows={parsed.rows}
        oldLabel="HEAD"
        newLabel="Working tree"
        oldText={collect(parsed.rows, "left")}
        newText={collect(parsed.rows, "right")}
        lang={file ? langFromPath(file) : undefined}
        onStageHunk={onStageHunk}
        onRevertHunk={onRevertHunk}
        selectable={!!onApplyLines}
        selectedKeys={selected}
        onToggleLine={toggle}
      />
      {selected.size > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {selected.size} line{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="xs" onClick={() => apply("stage")}>
              <RiAddLine /> Stage selected
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive"
              onClick={() => apply("discard")}
            >
              <RiArrowGoBackLine /> Discard
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              <RiCloseLine /> Clear
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Reconstruct one side's visible text (for the side-by-side copy buttons).
function collect(rows: DiffRow[], side: "left" | "right"): string {
  return rows
    .flatMap((r) => {
      if (r.type !== "line") return [];
      const text = side === "left" ? r.leftText : r.rightText;
      return text !== null ? [text] : [];
    })
    .join("\n");
}
