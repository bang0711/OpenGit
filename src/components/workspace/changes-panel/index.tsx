"use client";

import {
  RiAddLine,
  RiArrowDownSLine,
  RiDeleteBinLine,
  RiGitCommitLine,
  RiInboxArchiveLine,
  RiLoader4Line,
  RiSubtractLine,
} from "@remixicon/react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { FileStatus } from "@/lib/git";
import { FileGroup } from "./file-group";
import { FileRow } from "./file-row";

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
