"use client";

import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowGoBackLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiFileTextLine,
  RiGitCommitLine,
  RiInboxArchiveLine,
  RiLoader4Line,
  RiSubtractLine,
} from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ActionState,
  amendCommit,
  commit,
  discardAll,
  discardFile,
  stageAll,
  stageFile,
  stashPush,
  unstageAll,
  unstageFile,
} from "@/app/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NameDialog } from "@/components/name-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { FileStatus } from "@/lib/git";
import { cn } from "@/lib/utils";

type DiscardTarget =
  | { kind: "all" }
  | { kind: "file"; file: string; untracked: boolean };

export function ChangesPanel({ files }: { files: FileStatus[] }) {
  const [message, setMessage] = useState("");
  const [discard, setDiscard] = useState<DiscardTarget | null>(null);
  const [stashOpen, setStashOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const staged = files.filter((f) => f.staged);
  const unstaged = files.filter((f) => f.unstaged || f.untracked);

  const run = (action: () => Promise<ActionState>, after?: () => void) =>
    startTransition(async () => {
      const r = await action();
      if (r?.error) toast.error(r.error);
      else after?.();
    });

  const confirmDiscard = () => {
    if (!discard) return;
    if (discard.kind === "all") {
      run(discardAll, () => toast.success("Discarded all changes"));
    } else {
      run(
        () => discardFile(discard.file, discard.untracked),
        () => toast.success("Discarded changes"),
      );
    }
    setDiscard(null);
  };

  const onStash = (msg: string) =>
    run(
      () => stashPush(msg || undefined),
      () => toast.success("Stashed changes"),
    );

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-semibold text-muted-foreground">
        Working tree
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          disabled={pending || files.length === 0}
          onClick={() => setStashOpen(true)}
        >
          <RiInboxArchiveLine /> Stash
        </Button>
      </div>

      <FileGroup
        title="Staged"
        count={staged.length}
        action={
          staged.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() => run(unstageAll)}
            >
              <RiSubtractLine /> Unstage all
            </Button>
          ) : null
        }
      >
        {staged.map((f) => (
          <FileRow
            key={`s-${f.path}`}
            file={f}
            staged
            pending={pending}
            onPrimary={() => run(() => unstageFile(f.path))}
          />
        ))}
      </FileGroup>

      <FileGroup
        title="Changes"
        count={unstaged.length}
        action={
          unstaged.length > 0 ? (
            <>
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                title="Discard all changes"
                onClick={() => setDiscard({ kind: "all" })}
              >
                <RiDeleteBinLine /> Discard all
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() => run(stageAll)}
              >
                <RiAddLine /> Stage all
              </Button>
            </>
          ) : null
        }
      >
        {unstaged.map((f) => (
          <FileRow
            key={`u-${f.path}`}
            file={f}
            pending={pending}
            onPrimary={() => run(() => stageFile(f.path))}
            onDiscard={() =>
              setDiscard({
                kind: "file",
                file: f.path,
                untracked: f.untracked,
              })
            }
          />
        ))}
      </FileGroup>

      <div className="mt-auto border-t border-border p-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          rows={3}
          className="resize-none text-xs"
        />
        <div className="mt-2 flex">
          <Button
            className="flex-1 rounded-r-none"
            size="lg"
            disabled={pending || staged.length === 0 || !message.trim()}
            onClick={() =>
              run(
                () => commit(message),
                () => {
                  setMessage("");
                  toast.success("Changes committed");
                },
              )
            }
          >
            {pending ? (
              <RiLoader4Line className="animate-spin" />
            ) : (
              <RiGitCommitLine />
            )}
            Commit {staged.length > 0 ? `${staged.length} file(s)` : ""}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-lg"
                disabled={pending}
                title="Commit options"
                className="rounded-l-none border-l border-primary-foreground/20"
              >
                <RiArrowDownSLine />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => amendCommit(message || undefined),
                    () => {
                      setMessage("");
                      toast.success("Amended last commit");
                    },
                  )
                }
              >
                <RiGitCommitLine className="mr-2 size-3.5" />
                Amend last commit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        open={!!discard}
        onOpenChange={(o) => !o && setDiscard(null)}
        title={
          discard?.kind === "all" ? "Discard all changes?" : "Discard changes?"
        }
        description={
          discard?.kind === "all" ? (
            "All uncommitted changes in tracked files will be reverted and untracked files deleted. This cannot be undone."
          ) : discard ? (
            <>
              Changes to{" "}
              <span className="font-semibold text-foreground">
                {discard.file}
              </span>{" "}
              will be {discard.untracked ? "deleted" : "reverted"}. This cannot
              be undone.
            </>
          ) : null
        }
        confirmLabel={discard?.kind === "all" ? "Discard all" : "Discard"}
        destructive
        pending={pending}
        onConfirm={confirmDiscard}
      />

      <NameDialog
        open={stashOpen}
        onOpenChange={setStashOpen}
        title="Stash changes"
        label="Message (optional)"
        placeholder="WIP"
        submitLabel="Stash"
        allowEmpty
        onSubmit={onStash}
      />
    </div>
  );
}

function FileGroup({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-h-[45%] min-h-9 flex-col border-b border-border">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-semibold text-muted-foreground">
        {title}
        <Badge variant="secondary">{count}</Badge>
        <div className="ml-auto flex items-center gap-1">{action}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {count === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground/60">
            Nothing here.
          </p>
        ) : (
          <div className="pb-1">{children}</div>
        )}
      </ScrollArea>
    </div>
  );
}

function FileRow({
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
          <div className="ml-auto flex shrink-0 items-center opacity-0 group-hover:opacity-100">
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

function StatusBadge({ code }: { code: string }) {
  const map: Record<string, string> = {
    M: "text-amber-500",
    A: "text-green-500",
    D: "text-red-500",
    R: "text-blue-500",
    C: "text-blue-500",
    "?": "text-muted-foreground",
    U: "text-purple-500",
  };
  return (
    <span
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center font-mono text-[0.625rem] font-bold",
        map[code] ?? "text-muted-foreground",
      )}
    >
      {code === "?" ? "U" : code}
    </span>
  );
}
