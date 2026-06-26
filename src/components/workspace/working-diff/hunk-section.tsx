import { Button } from "@/components/ui/button";
import { HunkLines } from "./hunk-lines";

export function Section({
  title,
  empty,
  hunks,
  actionLabel,
  actionIcon,
  pending,
  onAction,
}: {
  title: string;
  empty: string;
  hunks: string[];
  actionLabel: string;
  actionIcon: React.ReactNode;
  pending: boolean;
  onAction: (index: number) => void;
}) {
  return (
    <div>
      <div className="bg-muted/40 sticky top-0 z-10 border-b border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
        {title} ({hunks.length})
      </div>
      {hunks.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground/60">{empty}</p>
      ) : (
        hunks.map((hunk, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: hunk index is the git apply target
          <div key={`${title}-${i}`} className="border-b border-border">
            <div className="flex items-center gap-2 bg-card/60 px-3 py-0.5">
              <span className="truncate font-mono text-[0.625rem] text-muted-foreground">
                {hunk.split("\n")[0]}
              </span>
              <Button
                size="xs"
                variant="outline"
                className="ml-auto"
                disabled={pending}
                onClick={() => onAction(i)}
              >
                {actionIcon}
                {actionLabel}
              </Button>
            </div>
            <HunkLines hunk={hunk} />
          </div>
        ))
      )}
    </div>
  );
}
