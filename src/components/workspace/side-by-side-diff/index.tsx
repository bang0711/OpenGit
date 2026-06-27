"use client";

import { useRef } from "react";
import { CopyButton } from "@/components/copy-button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type { DiffRow } from "@/lib/diff";
import { DiffRows } from "./diff-rows";

/**
 * Azure-style side-by-side diff with a draggable divider. Rows share one
 * vertical scroll and a single grid template, so the two sides stay aligned
 * while the split is resizable.
 */
export function SideBySideDiff({
  rows,
  oldLabel,
  newLabel,
  oldText,
  newText,
  lang,
  onStageHunk,
  onRevertHunk,
}: {
  rows: DiffRow[];
  oldLabel: string;
  newLabel: string;
  oldText: string;
  newText: string;
  lang?: string;
  onStageHunk?: (index: number) => void;
  onRevertHunk?: (index: number) => void;
}) {
  const [leftPct, setLeftPct] = usePersistedState("opengit.diffSplit", 50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cols = { gridTemplateColumns: `${leftPct}% ${100 - leftPct}%` };

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(80, Math.max(20, Math.round(pct))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col font-mono text-xs">
      <div
        className="bg-muted/40 text-muted-foreground border-border sticky top-0 z-10 grid border-b"
        style={cols}
      >
        <div className="border-border flex items-center gap-1 border-r px-3 py-0.5">
          <span className="truncate font-sans font-semibold" title={oldLabel}>
            {oldLabel}
          </span>
          <span className="ml-auto shrink-0">
            <CopyButton text={oldText} label="old version" />
          </span>
        </div>
        <div className="flex items-center gap-1 px-3 py-0.5">
          <span className="truncate font-sans font-semibold" title={newLabel}>
            {newLabel}
          </span>
          <span className="ml-auto shrink-0">
            <CopyButton text={newText} label="new version" />
          </span>
        </div>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <ScrollArea className="inset-0 h-full">
          <div>
            <DiffRows
              rows={rows}
              cols={cols}
              lang={lang}
              onStage={onStageHunk}
              onRevert={onRevertHunk}
            />
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {/* Draggable divider overlaying the viewport at the split position. */}
        <button
          type="button"
          aria-label="Resize diff columns"
          onPointerDown={startDrag}
          style={{ left: `${leftPct}%` }}
          className="hover:bg-primary/30 absolute top-0 bottom-0 -ml-1 w-2 cursor-col-resize"
        />
      </div>
    </div>
  );
}
