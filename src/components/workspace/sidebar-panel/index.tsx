"use client";

import {
  RiAddLine,
  RiCloudLine,
  RiDownloadCloud2Line,
  RiGitBranchLine,
  RiInboxArchiveLine,
  RiPriceTag3Line,
} from "@remixicon/react";
import { useState } from "react";
import {
  createBranch,
  createRemoteBranch,
  fetchTags,
  publishBranch,
} from "@/app/actions";
import { ActionTooltip } from "@/components/action-tooltip";
import { GithubAccount } from "@/components/github-account";
import { NameDialog } from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Branch, Remote, Stash, Tag } from "@/lib/git";
import { notify } from "@/lib/notify";
import { BranchRow, ICON } from "./branch-row";
import { NewRemoteBranchDialog } from "./new-remote-branch-dialog";
import { LfsSection } from "./lfs-section";
import { Section } from "./section";
import { StashRow } from "./stash-row";
import { SubmoduleSection } from "./submodule-section";
import { TagRow } from "./tag-row";
import { WorktreeSection } from "./worktree-section";

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

  const [fetchingTags, setFetchingTags] = useState(false);
  const onFetchTags = () => {
    if (fetchingTags) return;
    setFetchingTags(true);
    fetchTags()
      .then((r) => notify(r, "Fetched tags"))
      .finally(() => setFetchingTags(false));
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
              <ActionTooltip label="New branch">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={creating}
                  onClick={() => setNewBranchOpen(true)}
                >
                  <RiAddLine />
                </Button>
              </ActionTooltip>
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
                <ActionTooltip label="New remote branch">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={publishing}
                    onClick={() => setNewRemoteOpen(true)}
                  >
                    <RiAddLine />
                  </Button>
                </ActionTooltip>
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

          <Section
            icon={<RiPriceTag3Line />}
            label="Tags"
            count={tags.length}
            action={
              remoteNames.length > 0 ? (
                <ActionTooltip label="Fetch tags from remote">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={fetchingTags}
                    onClick={onFetchTags}
                  >
                    <RiDownloadCloud2Line />
                  </Button>
                </ActionTooltip>
              ) : null
            }
          >
            {tags.map((t) => (
              <TagRow key={t.name} tag={t} />
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

          <SubmoduleSection />

          <WorktreeSection />

          <LfsSection />
        </div>
      </ScrollArea>

      <div className="border-border shrink-0 border-t p-2">
        <GithubAccount />
      </div>

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
