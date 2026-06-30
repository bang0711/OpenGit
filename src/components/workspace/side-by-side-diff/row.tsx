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
  selectable,
  selectedKeys,
  onToggleLine,
}: {
  row: DiffRow;
  cols: React.CSSProperties;
  lang?: string;
  hunkIndex?: number;
  onStage?: (index: number) => void;
  onRevert?: (index: number) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggleLine?: (key: string) => void;
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
  const delKey = row.leftNo !== null ? `d:${row.leftNo}` : null;
  const addKey = row.rightNo !== null ? `a:${row.rightNo}` : null;
  return (
    <div className="grid" style={cols}>
      <Cell
        no={row.leftNo}
        text={row.leftText}
        tone={row.leftDel ? "del" : "ctx"}
        sign={row.leftDel ? "-" : " "}
        lang={lang}
        className="border-border border-r"
        selectable={selectable && row.leftDel}
        selected={delKey ? selectedKeys?.has(delKey) : false}
        onToggle={delKey ? () => onToggleLine?.(delKey) : undefined}
      />
      <Cell
        no={row.rightNo}
        text={row.rightText}
        tone={row.rightAdd ? "add" : "ctx"}
        sign={row.rightAdd ? "+" : " "}
        lang={lang}
        selectable={selectable && row.rightAdd}
        selected={addKey ? selectedKeys?.has(addKey) : false}
        onToggle={addKey ? () => onToggleLine?.(addKey) : undefined}
      />
    </div>
  );
}
