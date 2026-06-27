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
}: {
  patch: string | null;
  file?: string;
  onStageHunk?: (index: number) => void;
  onRevertHunk?: (index: number) => void;
}) {
  if (patch === null) return null;
  const parsed = parseUnifiedDiff(patch);
  if (parsed.rows.length === 0) {
    return (
      <Notice className="text-sm">
        {parsed.binary ? "Binary file — no textual diff." : "No changes."}
      </Notice>
    );
  }
  return (
    <SideBySideDiff
      rows={parsed.rows}
      oldLabel="HEAD"
      newLabel="Working tree"
      oldText={collect(parsed.rows, "left")}
      newText={collect(parsed.rows, "right")}
      lang={file ? langFromPath(file) : undefined}
      onStageHunk={onStageHunk}
      onRevertHunk={onRevertHunk}
    />
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
