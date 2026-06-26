import type { DiffRow } from "@/lib/diff";
import { Row } from "./row";

export function DiffRows({
  rows,
  cols,
}: {
  rows: DiffRow[];
  cols: React.CSSProperties;
}) {
  // Manual key counter — rows are static and positional.
  const els: React.ReactNode[] = [];
  let k = 0;
  for (const row of rows) {
    els.push(<Row key={`r${k++}`} row={row} cols={cols} />);
  }
  return <>{els}</>;
}
