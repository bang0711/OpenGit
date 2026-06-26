import Link from "next/link";
import { statusColor } from "@/components/shared/file-status";
import type { CommitFile } from "@/lib/git";
import { cn } from "@/lib/utils";

export function FileRow({ file, sha }: { file: CommitFile; sha: string }) {
  return (
    <Link
      href={{ pathname: "/diff", query: { sha, file: file.path } }}
      title="View changes"
      className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-xs"
    >
      <span
        className={cn(
          "w-3 shrink-0 text-center font-mono font-bold",
          statusColor(file.status),
        )}
      >
        {file.status}
      </span>
      <span className="truncate" title={file.path}>
        {file.path}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[0.625rem]">
        {file.additions >= 0 ? (
          <span className="text-green-500">+{file.additions}</span>
        ) : null}{" "}
        {file.deletions >= 0 ? (
          <span className="text-red-500">−{file.deletions}</span>
        ) : (
          <span className="text-muted-foreground">binary</span>
        )}
      </span>
    </Link>
  );
}
