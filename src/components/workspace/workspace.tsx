"use client";

import { RiAlertLine } from "@remixicon/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type {
  Branch,
  Commit,
  FileStatus,
  MergeState,
  Remote,
  RepoInfo,
  Stash,
  Tag,
} from "@/lib/git";
import { ChangesPanel } from "./changes-panel";
import { CommitDetailPane } from "./commit-detail";
import { CommitGraph } from "./commit-graph";
import { SidebarPanel } from "./sidebar-panel";
import { Topbar } from "./topbar";

export type WorkspaceData = {
  repo: RepoInfo;
  branches: Branch[];
  remotes: Remote[];
  tags: Tag[];
  stashes: Stash[];
  commits: Commit[];
  status: FileStatus[];
  merge: MergeState;
};

export function Workspace(data: WorkspaceData) {
  useAutoRefresh(data.repo.path);
  const current = data.branches.find((b) => b.isCurrent) ?? null;
  const [selected, setSelected] = usePersistedState<string | null>(
    `opengit.commit:${data.repo.path}`,
    null,
  );
  const conflicts = data.merge.conflicted.length;

  return (
    <div className="flex h-screen flex-col">
      <Topbar repo={data.repo} current={current} branches={data.branches} />

      {conflicts > 0 ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 text-xs text-destructive">
          <RiAlertLine className="size-4" />
          <span className="font-medium">
            {conflicts} conflicted file{conflicts > 1 ? "s" : ""} —{" "}
            {data.merge.inRebase ? "rebase" : "merge"} in progress
          </span>
          <Button asChild size="sm" variant="destructive" className="ml-auto">
            <Link href="/conflicts">Resolve conflicts</Link>
          </Button>
        </div>
      ) : null}

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="20%" minSize="14%" maxSize="32%">
          <SidebarPanel
            branches={data.branches}
            remotes={data.remotes}
            tags={data.tags}
            stashes={data.stashes}
          />
        </ResizablePanel>
        <ResizableHandle />

        <ResizablePanel defaultSize="55%" minSize="30%">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="60%" minSize="25%">
              <CommitGraph
                commits={data.commits}
                selected={selected}
                onSelect={setSelected}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="40%" minSize="15%">
              <CommitDetailPane sha={selected} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="25%" minSize="18%" maxSize="40%">
          <ChangesPanel files={data.status} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
