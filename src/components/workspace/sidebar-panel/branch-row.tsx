"use client";

import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiDeleteBinLine,
  RiEditLine,
  RiFileCopyLine,
  RiGitBranchLine,
  RiGitMergeLine,
  RiMore2Line,
} from "@remixicon/react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  checkoutBranch,
  deleteBranch,
  deleteRemoteBranch,
  mergeBranch,
  renameBranch,
} from "@/app/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Branch } from "@/lib/git";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type BranchAction = {
  key: string;
  label: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

export const ICON = "mr-2 size-3.5";

export function BranchRow({
  branch,
  current,
  remote,
}: {
  branch: Branch;
  current: string | null;
  remote?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(branch.name);
  const [deleteRemoteOpen, setDeleteRemoteOpen] = useState(false);
  // Show the leaf name; the remote prefix is already shown as a group header.
  const display = remote
    ? branch.name.split("/").slice(1).join("/")
    : branch.name;

  const run = (fn: () => Promise<{ error?: string }>, success: string) => {
    if (pending) return;
    setPending(true);
    fn()
      .then((r) => notify(r, success))
      .finally(() => setPending(false));
  };

  const onCheckout = () => {
    if (branch.isCurrent || !display) return;
    // For a remote branch, check out its leaf name so git sets up tracking
    // instead of landing in detached HEAD.
    run(() => checkoutBranch(display), `Checked out ${display}`);
  };

  const canMerge = !!current && current !== branch.name && !branch.isCurrent;
  const actions: BranchAction[] = [];
  if (!branch.isCurrent) {
    actions.push({
      key: "checkout",
      label: "Checkout",
      icon: <RiGitBranchLine className={ICON} />,
      onSelect: onCheckout,
    });
  }
  actions.push({
    key: "merge",
    label: current ? (
      <span>
        Merge <span className="font-semibold">{branch.name}</span> into{" "}
        <span className="font-semibold">{current}</span>
      </span>
    ) : (
      "Merge (no current branch)"
    ),
    icon: <RiGitMergeLine className={ICON} />,
    onSelect: () =>
      run(
        () => mergeBranch(branch.name),
        `Merged ${branch.name} into ${current}`,
      ),
    disabled: !canMerge,
  });
  actions.push({
    key: "copy",
    label: "Copy branch name",
    icon: <RiFileCopyLine className={ICON} />,
    onSelect: () => {
      navigator.clipboard?.writeText(branch.name);
      toast.success("Copied branch name");
    },
  });
  if (!branch.isRemote) {
    actions.push({
      key: "rename",
      label: "Rename branch…",
      icon: <RiEditLine className={ICON} />,
      onSelect: () => {
        setRenameValue(branch.name);
        setRenameOpen(true);
      },
      separatorBefore: true,
    });
    actions.push({
      key: "delete",
      label: "Delete branch",
      icon: <RiDeleteBinLine className={ICON} />,
      onSelect: () =>
        run(() => deleteBranch(branch.name), `Deleted ${branch.name}`),
      disabled: branch.isCurrent,
      danger: true,
    });
  } else {
    actions.push({
      key: "delete-remote",
      label: "Delete remote branch",
      icon: <RiDeleteBinLine className={ICON} />,
      onSelect: () => setDeleteRemoteOpen(true),
      danger: true,
      separatorBefore: true,
    });
  }

  const remoteName = branch.name.split("/")[0];

  const submitRename = () => {
    const next = renameValue.trim();
    setRenameOpen(false);
    if (!next || next === branch.name) return;
    run(() => renameBranch(branch.name, next), `Renamed to ${next}`);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            title={`${branch.name} @ ${branch.sha}\n${branch.subject}`}
            className={cn(
              "group/branch flex items-center gap-1.5 rounded-md py-0.5 pr-1 pl-6 text-xs",
              branch.isCurrent
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent",
            )}
          >
            <button
              type="button"
              onClick={onCheckout}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
            >
              <RiGitBranchLine
                className={cn(
                  "size-3.5 shrink-0",
                  branch.isCurrent ? "text-primary" : "text-muted-foreground",
                  pending && "animate-pulse",
                )}
              />
              <span className="truncate">{display}</span>
              <span className="ml-auto flex items-center gap-1 text-[0.625rem] text-muted-foreground">
                {branch.behind > 0 ? (
                  <span className="flex items-center">
                    <RiArrowDownLine className="size-2.5" />
                    {branch.behind}
                  </span>
                ) : null}
                {branch.ahead > 0 ? (
                  <span className="flex items-center">
                    <RiArrowUpLine className="size-2.5" />
                    {branch.ahead}
                  </span>
                ) : null}
              </span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 opacity-0 group-hover/branch:opacity-100 data-[state=open]:opacity-100"
                  title="Branch actions"
                >
                  <RiMore2Line />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {actions.map((a) => (
                  <Fragment key={a.key}>
                    {a.separatorBefore ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      disabled={a.disabled}
                      onSelect={a.onSelect}
                      className={cn(a.danger && "text-destructive")}
                    >
                      {a.icon}
                      {a.label}
                    </DropdownMenuItem>
                  </Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {actions.map((a) => (
            <Fragment key={a.key}>
              {a.separatorBefore ? <ContextMenuSeparator /> : null}
              <ContextMenuItem
                disabled={a.disabled}
                onSelect={a.onSelect}
                className={cn(a.danger && "text-destructive")}
              >
                {a.icon}
                {a.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename branch</DialogTitle>
            <DialogDescription>
              Renaming{" "}
              <span className="font-semibold text-foreground">
                {branch.name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRename();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !renameValue.trim() || renameValue.trim() === branch.name
                }
              >
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteRemoteOpen}
        onOpenChange={setDeleteRemoteOpen}
        title="Delete remote branch?"
        description={
          <>
            This deletes{" "}
            <span className="font-semibold text-foreground">{branch.name}</span>{" "}
            from <span className="font-semibold">{remoteName}</span>. This
            cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        pending={pending}
        onConfirm={() => {
          setDeleteRemoteOpen(false);
          run(
            () => deleteRemoteBranch(remoteName, display),
            `Deleted ${branch.name}`,
          );
        }}
      />
    </>
  );
}
