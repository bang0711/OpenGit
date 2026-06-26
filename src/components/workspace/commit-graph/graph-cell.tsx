import { type GraphRow, laneColor } from "@/lib/graph";
import { laneX, ROW_H } from ".";

const DOT_R = 4.5;

export function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const mid = ROW_H / 2;
  const edges: React.ReactNode[] = [];
  let k = 0; // manual key counter — render position is the edge's identity

  // Top half: lanes above connecting down to the commit / passing through.
  for (let i = 0; i < row.lanesBefore.length; i++) {
    const sha = row.lanesBefore[i];
    if (sha === null) continue;
    const stroke = laneColor(row.colorsBefore[i]);
    edges.push(
      sha === row.commit.sha ? (
        <path
          key={`e${k++}`}
          d={curve(laneX(i), 0, laneX(row.col), mid)}
          stroke={stroke}
          fill="none"
          strokeWidth={1.75}
        />
      ) : (
        <line
          key={`e${k++}`}
          x1={laneX(i)}
          y1={0}
          x2={laneX(i)}
          y2={mid}
          stroke={stroke}
          strokeWidth={1.75}
        />
      ),
    );
  }

  // Bottom half: commit routing to its parents / lanes passing through.
  for (let j = 0; j < row.lanesAfter.length; j++) {
    const sha = row.lanesAfter[j];
    if (sha === null) continue;
    const stroke = laneColor(row.colorsAfter[j]);
    edges.push(
      row.parentCols.includes(j) ? (
        <path
          key={`e${k++}`}
          d={curve(laneX(row.col), mid, laneX(j), ROW_H)}
          stroke={stroke}
          fill="none"
          strokeWidth={1.75}
        />
      ) : (
        <line
          key={`e${k++}`}
          x1={laneX(j)}
          y1={mid}
          x2={laneX(j)}
          y2={ROW_H}
          stroke={stroke}
          strokeWidth={1.75}
        />
      ),
    );
  }

  return (
    <svg
      width={width}
      height={ROW_H}
      className="shrink-0"
      style={{ minWidth: width }}
      aria-hidden="true"
    >
      <title>commit graph</title>
      {edges}
      <circle
        cx={laneX(row.col)}
        cy={mid}
        r={DOT_R}
        fill={laneColor(row.color)}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** A vertical-ish edge that bends near the destination for a smooth join. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}
