import { RiLoader4Line } from "@remixicon/react";
import { SideBySideDiff } from "@/components/workspace/side-by-side-diff";
import { type DiffRow, parseUnifiedDiff } from "@/lib/diff";
import { langFromPath } from "@/lib/highlight";
import { Notice } from "./notice";

/** Renders one file's diff (or a notice/spinner) from a raw unified patch. */
export function DiffPane({
  patch,
  pending,
  error,
  file,
  oldLabel,
  newLabel,
}: {
  patch: string | null;
  pending: boolean;
  error: string | null;
  file: string | null;
  oldLabel: string;
  newLabel: string;
}) {
  if (!file) return <Notice>Select a file to view changes.</Notice>;
  // Keep the old diff visible while the next one loads — show a spinner only on
  // the first load (no patch yet).
  if (pending && patch === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        <RiLoader4Line className="size-5 animate-spin" />
      </div>
    );
  }
  if (error) return <Notice>{error}</Notice>;
  if (patch === null) return <Notice>No changes.</Notice>;

  const parsed = parseUnifiedDiff(patch);
  if (parsed.rows.length === 0) {
    return (
      <Notice>
        {parsed.binary ? "Binary file — no textual diff." : "No changes."}
      </Notice>
    );
  }

  return (
    <SideBySideDiff
      rows={parsed.rows}
      oldLabel={oldLabel}
      newLabel={newLabel}
      oldText={collect(parsed.rows, "left")}
      newText={collect(parsed.rows, "right")}
      lang={langFromPath(file)}
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
