"use client";

import {
  RiAddLine,
  RiArrowLeftLine,
  RiErrorWarningLine,
  RiGitBranchLine,
  RiGithubFill,
  RiGitPullRequestLine,
  RiLogoutBoxRLine,
  RiRefreshLine,
  RiTeamLine,
} from "@remixicon/react";
import type {
  Collaborator,
  GhStatus,
  GithubBranch,
  GithubIssue,
  PullRequest,
} from "@shared/types";
import { useCallback, useEffect, useState } from "react";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import Link from "@/lib/link";
import { ConnectForm } from "./connect-form";
import { CreatePrDialog } from "./create-pr-dialog";
import { Branches, Collaborators, Issues } from "./lists";
import { PrDetail } from "./pr-detail";
import { PrList } from "./pr-list";
import { PrListSkeleton } from "./skeletons";

type Lists = {
  prs: PullRequest[];
  collaborators: Collaborator[];
  issues: GithubIssue[];
  branches: GithubBranch[];
};
const EMPTY: Lists = { prs: [], collaborators: [], issues: [], branches: [] };
const arr = <T,>(x: T[] | { error: string }): T[] => (Array.isArray(x) ? x : []);

type Section = "prs" | "issues" | "collab" | "branches";

const SECTION_LABEL: Record<Section, string> = {
  prs: "Pull Requests",
  issues: "Issues",
  collab: "People",
  branches: "Branches",
};

export function GithubPanel() {
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [data, setData] = useState<Lists>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("prs");
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch in the component (not a route loader) so navigation is instant.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await window.github.tokenStatus();
      setStatus(s);
      if (!s.connected) {
        setData(EMPTY);
        return;
      }
      const [prs, collaborators, issues, branches] = await Promise.all([
        window.github.listPRs(),
        window.github.listCollaborators(),
        window.github.listIssues(),
        window.github.listRemoteBranches(),
      ]);
      setData({
        prs: arr(prs),
        collaborators: arr(collaborators),
        issues: arr(issues),
        branches: arr(branches),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // One-time load on mount (no polling); use the Refresh button to re-pull.
  useEffect(() => {
    load();
  }, [load]);

  // Reload lists + open PR detail (the detail reloads when refreshKey changes).
  const reload = () => {
    load();
    setRefreshKey((k) => k + 1);
  };

  // Manual Refresh: drop the ETag cache first so everything pulls fresh 200s.
  const refresh = async () => {
    await window.github.invalidate();
    reload();
  };

  const disconnect = async () => {
    await window.github.clearToken();
    setSelectedPr(null);
    load();
  };

  // Only the resolved "no token" case drops the sidebar. While the first fetch
  // is still in flight (status === null) we optimistically render the shell so
  // the layout never blanks out — the content area shows the loading state.
  if (status && !status.connected) {
    return (
      <div className="bg-background h-screen">
        <ConnectForm reason={status.reason} onConnected={load} />
      </div>
    );
  }
  const login = status?.connected ? status.login : "";

  const openCount = data.prs.filter((p) => p.state === "open").length;
  const nav: { key: Section; icon: React.ReactNode; count: number }[] = [
    { key: "prs", icon: <RiGitPullRequestLine />, count: openCount },
    { key: "issues", icon: <RiErrorWarningLine />, count: data.issues.length },
    { key: "collab", icon: <RiTeamLine />, count: data.collaborators.length },
    { key: "branches", icon: <RiGitBranchLine />, count: data.branches.length },
  ];

  return (
    <SidebarProvider className="h-screen min-h-0 overflow-hidden">
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <RiGithubFill className="size-5" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">GitHub</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {login || "Connecting…"}
                    </span>
                  </div>
                  <RiArrowLeftLine className="ml-auto size-4" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {nav.map((n) => (
                <SidebarMenuItem key={n.key}>
                  <SidebarMenuButton
                    tooltip={SECTION_LABEL[n.key]}
                    isActive={section === n.key}
                    onClick={() => setSection(n.key)}
                  >
                    {n.icon}
                    <span>{SECTION_LABEL[n.key]}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{n.count}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Disconnect GitHub"
                onClick={disconnect}
              >
                <RiLogoutBoxRLine />
                <span>Disconnect</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <SidebarTrigger />
          <span className="font-heading text-sm font-semibold">
            {SECTION_LABEL[section]}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ActionTooltip label="Refresh">
              <Button variant="ghost" size="icon" onClick={refresh}>
                <RiRefreshLine />
              </Button>
            </ActionTooltip>
            <Button size="sm" onClick={() => setCreating(true)}>
              <RiAddLine /> New PR
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {loading && status === null ? (
            <div className="flex h-full">
              <div className="border-border w-[38%] shrink-0 overflow-hidden border-r">
                <PrListSkeleton />
              </div>
              <div className="flex-1" />
            </div>
          ) : section === "prs" ? (
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel defaultSize="38%" minSize="24%" maxSize="55%">
                <ScrollArea className="h-full">
                  <div className="p-3">
                    <PrList
                      prs={data.prs}
                      selected={selectedPr}
                      onSelect={setSelectedPr}
                    />
                  </div>
                </ScrollArea>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="62%">
                {selectedPr !== null ? (
                  <PrDetail
                    number={selectedPr}
                    refreshKey={refreshKey}
                    onBack={() => setSelectedPr(null)}
                    onChanged={load}
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
                    <RiGitPullRequestLine className="size-10 opacity-30" />
                    <p className="text-sm">Select a pull request.</p>
                  </div>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-3xl p-4">
                {section === "issues" ? (
                  <Issues issues={data.issues} />
                ) : section === "collab" ? (
                  <Collaborators collaborators={data.collaborators} />
                ) : (
                  <Branches branches={data.branches} />
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </SidebarInset>

      <CreatePrDialog
        open={creating}
        onOpenChange={setCreating}
        branches={data.branches}
        collaborators={data.collaborators}
        onCreated={load}
      />
    </SidebarProvider>
  );
}
