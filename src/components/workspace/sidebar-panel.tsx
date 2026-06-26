"use client";

import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiArrowUpLine,
  RiCloudLine,
  RiDeleteBinLine,
  RiEditLine,
  RiFileCopyLine,
  RiGitBranchLine,
  RiGitMergeLine,
  RiInboxArchiveLine,
  RiMore2Line,
  RiPriceTag3Line,
} from "@remixicon/react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  mergeBranch,
  renameBranch,
  stashApply,
  stashDrop,
  stashPop,
} from "@/app/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NameDialog } from "@/components/name-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type { Branch, Remote, Stash, Tag } from "@/lib/git";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Props = {
  branches: Branch[];
  remotes: Remote[];
  tags: Tag[];
  stashes: Stash[];
};

export function SidebarPanel({ branches, remotes, tags, stashes }: Props) {
  const local = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);
  const current = local.find((b) => b.isCurrent)?.name ?? null;

  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const onCreateBranch = (name: string) => {
    if (creating) return;
    setCreating(true);
    createBranch(name)
      .then((r) => notify(r, `Created ${name}`))
      .finally(() => setCreating(false));
  };

  // Group remote branches under their remote name.
  const byRemote = new Map<string, Branch[]>();
  for (const b of remoteBranches) {
    const remote = b.name.split("/")[0];
    const list = byRemote.get(remote) ?? [];
    list.push(b);
    byRemote.set(remote, list);
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          <Section
            icon={<RiGitBranchLine />}
            label="Local"
            count={local.length}
            defaultOpen
            action={
              <Button
                variant="ghost"
                size="icon-xs"
                title="New branch"
                disabled={creating}
                onClick={() => setNewBranchOpen(true)}
              >
                <RiAddLine />
              </Button>
            }
            contextActions={
              <ContextMenuItem
                disabled={creating}
                onSelect={() => setNewBranchOpen(true)}
              >
                <RiAddLine className={ICON} />
                New branch…
              </ContextMenuItem>
            }
          >
            {local.map((b) => (
              <BranchRow key={b.fullName} branch={b} current={current} />
            ))}
          </Section>

          <Section
            icon={<RiCloudLine />}
            label="Remotes"
            count={remoteBranches.length}
            defaultOpen
          >
            {[...byRemote].map(([remote, list]) => {
              const url = remotes.find((r) => r.name === remote)?.url;
              return (
                <div key={remote} className="mt-1">
                  <div
                    className="truncate px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase"
                    title={url}
                  >
                    {remote}
                  </div>
                  {list.map((b) => (
                    <BranchRow
                      key={b.fullName}
                      branch={b}
                      current={current}
                      remote
                    />
                  ))}
                </div>
              );
            })}
          </Section>

          <Section icon={<RiPriceTag3Line />} label="Tags" count={tags.length}>
            {tags.map((t) => (
              <Row key={t.name}>
                <RiPriceTag3Line className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground">
                  {t.sha}
                </span>
              </Row>
            ))}
          </Section>

          <Section
            icon={<RiInboxArchiveLine />}
            label="Stashes"
            count={stashes.length}
          >
            {stashes.map((s) => (
              <StashRow key={s.ref} stash={s} />
            ))}
          </Section>
        </div>
      </ScrollArea>

      <NameDialog
        open={newBranchOpen}
        onOpenChange={setNewBranchOpen}
        title="New branch"
        description="Creates a branch from the current HEAD and switches to it."
        label="Branch name"
        placeholder="feature/my-branch"
        submitLabel="Create branch"
        onSubmit={onCreateBranch}
      />
    </div>
  );
}

function Section({
  icon,
  label,
  count,
  defaultOpen = false,
  action,
  contextActions,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  contextActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = usePersistedState(
    `opengit.section:${label}`,
    defaultOpen,
  );
  const header = (
    <div className="group/section flex items-center gap-0.5">
      <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-sidebar-foreground/90 hover:bg-sidebar-accent">
        {open ? (
          <RiArrowDownSLine className="size-3.5 text-muted-foreground" />
        ) : (
          <RiArrowRightSLine className="size-3.5 text-muted-foreground" />
        )}
        <span className="[&_svg]:size-3.5 [&_svg]:text-muted-foreground">
          {icon}
        </span>
        {label}
        <Badge variant="secondary" className="ml-auto font-normal">
          {count}
        </Badge>
      </CollapsibleTrigger>
      {action ? (
        <span className="shrink-0 opacity-0 group-hover/section:opacity-100 focus-within:opacity-100">
          {action}
        </span>
      ) : null}
    </div>
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {contextActions ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {contextActions}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        header
      )}
      <CollapsibleContent className="mt-0.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Row({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs"
    >
      {children}
    </div>
  );
}

type BranchAction = {
  key: string;
  label: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

const ICON = "mr-2 size-3.5";

function BranchRow({
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

function StashRow({ stash }: { stash: Stash }) {
  const [pending, setPending] = useState(false);
  const run = (fn: () => Promise<{ error?: string }>, success: string) => {
    if (pending) return;
    setPending(true);
    fn()
      .then((r) => notify(r, success))
      .finally(() => setPending(false));
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          title={`${stash.ref}\n${stash.message}`}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs hover:bg-sidebar-accent",
            pending && "opacity-60",
          )}
        >
          <RiInboxArchiveLine className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{stash.message}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onSelect={() => run(() => stashApply(stash.ref), "Stash applied")}
        >
          Apply
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => run(() => stashPop(stash.ref), "Stash popped")}
        >
          Pop (apply &amp; drop)
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive"
          onSelect={() => run(() => stashDrop(stash.ref), "Stash dropped")}
        >
          Drop
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
