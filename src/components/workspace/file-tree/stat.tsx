import { statusColor } from "@/components/shared/file-status";
import type { CommitFile } from "@/lib/git";
import { cn } from "@/lib/utils";

export function Stat({ file }: { file: CommitFile }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[0.625rem]">
      <span className={cn("font-bold", statusColor(file.status))}>
        {file.status}
      </span>
      {file.additions >= 0 ? (
        <span className="text-green-500">+{file.additions}</span>
      ) : null}
      {file.deletions >= 0 ? (
        <span className="text-red-500">−{file.deletions}</span>
      ) : null}
    </span>
  );
}
