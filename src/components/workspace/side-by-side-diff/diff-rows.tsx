import type { DiffRow } from "@/lib/diff";
import { Row } from "./row";

export function DiffRows({
  rows,
  cols,
  lang,
  onStage,
  onRevert,
}: {
  rows: DiffRow[];
  cols: React.CSSProperties;
  lang?: string;
  onStage?: (index: number) => void;
  onRevert?: (index: number) => void;
}) {
  // Manual key counter — rows are static and positional.
  const els: React.ReactNode[] = [];
  let k = 0;
  let hunkIdx = 0;
  for (const row of rows) {
    const hi = row.type === "hunk" ? hunkIdx++ : 0;
    els.push(
      <Row
        key={`r${k++}`}
        row={row}
        cols={cols}
        lang={lang}
        hunkIndex={hi}
        onStage={onStage}
        onRevert={onRevert}
      />,
    );
  }
  return <>{els}</>;
}
