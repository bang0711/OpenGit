import type { DiffRow } from "@/lib/diff";
import { Cell } from "./cell";

export function Row({
  row,
  cols,
}: {
  row: DiffRow;
  cols: React.CSSProperties;
}) {
  if (row.type === "hunk") {
    return (
      <div className="bg-primary/10 text-primary border-border border-y px-3 py-0.5">
        {row.text}
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
        className="border-border border-r"
      />
      <Cell
        no={row.rightNo}
        text={row.rightText}
        tone={row.rightAdd ? "add" : "ctx"}
        sign={row.rightAdd ? "+" : " "}
      />
    </div>
  );
}
