import { cn } from "@/lib/utils";

// Single source of truth for git status-code → color, used across the changes
// panel, commit detail, and file tree.
export const STATUS_COLOR: Record<string, string> = {
  M: "text-amber-500",
  A: "text-green-500",
  D: "text-red-500",
  R: "text-blue-500",
  C: "text-blue-500",
  "?": "text-muted-foreground",
  U: "text-purple-500",
};

export function statusColor(code: string): string {
  return STATUS_COLOR[code] ?? "text-muted-foreground";
}

/** Fixed-size status glyph (untracked "?" renders as "U"). */
export function StatusBadge({ code }: { code: string }) {
  return (
    <span
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center font-mono text-[0.625rem] font-bold",
        statusColor(code),
      )}
    >
      {code === "?" ? "U" : code}
    </span>
  );
}
