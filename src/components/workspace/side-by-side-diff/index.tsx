"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { CopyButton } from "@/components/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type { DiffRow } from "@/lib/diff";
import { Row } from "./row";

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
  selectable,
  selectedKeys,
  onToggleLine,
}: {
  rows: DiffRow[];
  oldLabel: string;
  newLabel: string;
  oldText: string;
  newText: string;
  lang?: string;
  onStageHunk?: (index: number) => void;
  onRevertHunk?: (index: number) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggleLine?: (key: string) => void;
}) {
  const [leftPct, setLeftPct] = usePersistedState("opengit.diffSplit", 50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cols = { gridTemplateColumns: `${leftPct}% ${100 - leftPct}%` };

  // Map each row index to its hunk ordinal (for stage/revert), -1 for non-hunks.
  const hunkIndexByRow = useMemo(() => {
    const arr: number[] = [];
    let h = 0;
    for (const r of rows) arr.push(r.type === "hunk" ? h++ : -1);
    return arr;
  }, [rows]);

  // Virtualize rows. Heights vary (long lines wrap), so measure dynamically via
  // the ResizeObserver tanstack wires up through measureElement.
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 16,
  });

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
        <ScrollArea className="h-full inset-0" viewportRef={scrollRef}>
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((vi) => (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virt.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <Row
                  row={rows[vi.index]}
                  cols={cols}
                  lang={lang}
                  hunkIndex={Math.max(0, hunkIndexByRow[vi.index])}
                  onStage={onStageHunk}
                  onRevert={onRevertHunk}
                  selectable={selectable}
                  selectedKeys={selectedKeys}
                  onToggleLine={onToggleLine}
                />
              </div>
            ))}
          </div>
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
