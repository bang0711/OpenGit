import { RiAddLine, RiArrowGoBackLine } from "@remixicon/react";
import { ActionTooltip } from "@/components/action-tooltip";
import type { DiffRow } from "@/lib/diff";
import { Cell } from "./cell";

export function Row({
  row,
  cols,
  lang,
  hunkIndex = 0,
  onStage,
  onRevert,
}: {
  row: DiffRow;
  cols: React.CSSProperties;
  lang?: string;
  hunkIndex?: number;
  onStage?: (index: number) => void;
  onRevert?: (index: number) => void;
}) {
  if (row.type === "hunk") {
    return (
      <div className="group/hunk flex items-center gap-2 border-y border-border bg-primary/10 px-3 py-0.5 text-primary">
        <span className="truncate">{row.text}</span>
        {onStage || onRevert ? (
          <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/hunk:opacity-100">
            {onStage ? (
              <ActionTooltip label="Stage this hunk">
                <button
                  type="button"
                  onClick={() => onStage(hunkIndex)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] hover:bg-primary/15"
                >
                  <RiAddLine className="size-3" /> Stage
                </button>
              </ActionTooltip>
            ) : null}
            {onRevert ? (
              <ActionTooltip label="Revert this hunk (discard these changes)">
                <button
                  type="button"
                  onClick={() => onRevert(hunkIndex)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] text-destructive hover:bg-destructive/10"
                >
                  <RiArrowGoBackLine className="size-3" /> Revert
                </button>
              </ActionTooltip>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="grid" style={cols}>
      <Cell
        no={row.leftNo}
        text={row.leftText}
        tone={row.leftDel ? "del" : "ctx"}
        sign={row.leftDel ? "-" : " "}
        lang={lang}
        className="border-border border-r"
      />
      <Cell
        no={row.rightNo}
        text={row.rightText}
        tone={row.rightAdd ? "add" : "ctx"}
        sign={row.rightAdd ? "+" : " "}
        lang={lang}
      />
    </div>
  );
}
