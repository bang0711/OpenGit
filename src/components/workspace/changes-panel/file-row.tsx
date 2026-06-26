"use client";

import {
  RiAddLine,
  RiArrowGoBackLine,
  RiFileCopyLine,
  RiFileTextLine,
  RiSubtractLine,
} from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DiffStat } from "@/components/shared/diff-stat";
import { StatusBadge } from "@/components/shared/file-status";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileStatus } from "@/lib/git";

export function FileRow({
  file,
  staged,
  pending,
  onPrimary,
  onDiscard,
}: {
  file: FileStatus;
  staged?: boolean;
  pending: boolean;
  onPrimary: () => void;
  onDiscard?: () => void;
}) {
  const router = useRouter();
  const code = file.untracked ? "?" : staged ? file.index : file.worktree;
  const diffHref = `/diff?wt=1&file=${encodeURIComponent(file.path)}`;
  const copyPath = () => {
    navigator.clipboard?.writeText(file.path);
    toast.success("Copied path");
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-center gap-1.5 px-3 py-0.5 text-xs hover:bg-muted/50">
          <StatusBadge code={code} />
          <Link
            href={{ pathname: "/diff", query: { wt: "1", file: file.path } }}
            className="truncate hover:underline"
            title={`View changes in ${file.path}`}
          >
            {file.path}
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <DiffStat
              adds={staged ? file.stagedAdds : file.unstagedAdds}
              dels={staged ? file.stagedDels : file.unstagedDels}
            />
            <div className="flex items-center opacity-0 group-hover:opacity-100">
              {onDiscard ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={pending}
                  title="Discard changes"
                  onClick={onDiscard}
                >
                  <RiArrowGoBackLine />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pending}
                title={staged ? "Unstage" : "Stage"}
                onClick={onPrimary}
              >
                {staged ? <RiSubtractLine /> : <RiAddLine />}
              </Button>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => router.push(diffHref)}>
          <RiFileTextLine />
          View changes
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={pending} onSelect={onPrimary}>
          {staged ? <RiSubtractLine /> : <RiAddLine />}
          {staged ? "Unstage changes" : "Stage changes"}
        </ContextMenuItem>
        {onDiscard ? (
          <ContextMenuItem
            variant="destructive"
            disabled={pending}
            onSelect={onDiscard}
          >
            <RiArrowGoBackLine />
            Discard changes
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={copyPath}>
          <RiFileCopyLine />
          Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
