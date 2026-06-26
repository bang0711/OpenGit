"use client";

import {
  RiAddLine,
  RiCloudLine,
  RiGitBranchLine,
  RiInboxArchiveLine,
  RiPriceTag3Line,
} from "@remixicon/react";
import { useState } from "react";
import { createBranch, createRemoteBranch, publishBranch } from "@/app/actions";
import { NameDialog } from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Branch, Remote, Stash, Tag } from "@/lib/git";
import { notify } from "@/lib/notify";
import { BranchRow, ICON } from "./branch-row";
import { NewRemoteBranchDialog } from "./new-remote-branch-dialog";
import { Row } from "./row";
import { Section } from "./section";
import { StashRow } from "./stash-row";

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

  const remoteNames = remotes.map((r) => r.name);
  const [newRemoteOpen, setNewRemoteOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const onCreateRemoteBranch = (
    name: string,
    remote: string,
    mode: "remote" | "both",
  ) => {
    if (publishing) return;
    setPublishing(true);
    const run = mode === "both" ? publishBranch : createRemoteBranch;
    run(remote, name)
      .then((r) =>
        notify(
          r,
          mode === "both"
            ? `Published ${name} to ${remote}`
            : `Created ${remote}/${name}`,
        ),
      )
      .finally(() => setPublishing(false));
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
            action={
              remoteNames.length > 0 ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="New remote branch"
                  disabled={publishing}
                  onClick={() => setNewRemoteOpen(true)}
                >
                  <RiAddLine />
                </Button>
              ) : null
            }
            contextActions={
              remoteNames.length > 0 ? (
                <ContextMenuItem
                  disabled={publishing}
                  onSelect={() => setNewRemoteOpen(true)}
                >
                  <RiAddLine className={ICON} />
                  New remote branch…
                </ContextMenuItem>
              ) : null
            }
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

      <NewRemoteBranchDialog
        open={newRemoteOpen}
        onOpenChange={setNewRemoteOpen}
        remotes={remoteNames}
        onSubmit={onCreateRemoteBranch}
      />
    </div>
  );
}
