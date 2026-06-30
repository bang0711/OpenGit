"use client";

import {
  RiArrowDownLine,
  RiArrowGoBackLine,
  RiArrowUpLine,
  RiCloseLine,
  RiDownloadCloud2Line,
  RiGitBranchLine,
  RiGitPullRequestLine,
  RiHistoryLine,
  RiSettings3Line,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { useState, useTransition } from "react";
import {
  type ActionState,
  closeRepo,
  gitFetch,
  gitPull,
  gitPush,
  gitPushForce,
  gitPushSetUpstream,
  mergeBranch,
  undoLast,
} from "@/app/actions";
import { ActionTooltip } from "@/components/action-tooltip";
import { GitLogo } from "@/components/git-logo";
import { RepoSettingsDialog } from "@/components/repo-settings-dialog";
import { toggleTerminal } from "@/components/terminal-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "@/lib/link";
import { useRouter } from "@/lib/router";
import { UpdateChecker } from "@/components/update-checker";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Branch, RepoInfo } from "@/lib/git";
import { notify } from "@/lib/notify";
import { MergeMenu } from "./merge-menu";
import { PullButton } from "./pull-button";
import { PushButton } from "./push-button";
import { ToolButton } from "./tool-button";

type Props = {
  repo: RepoInfo;
  current: Branch | null;
  branches: Branch[];
};

export function Topbar({ repo, current, branches }: Props) {
  const [pending, startTransition] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const run = (action: () => Promise<ActionState>, success: string) => {
    startTransition(async () => {
      notify(await action(), success);
    });
  };

  const router = useRouter();
  const close = () =>
    startTransition(async () => {
      await closeRepo();
      router.refresh();
    });

  const ahead = current?.ahead ?? 0;
  const behind = current?.behind ?? 0;

  return (
    <header className="border-border bg-card flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <div className="flex items-center gap-2">
        <GitLogo className="size-4 text-[#f05133]" />
        <span className="font-heading text-sm font-semibold">{repo.name}</span>
      </div>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <RiGitBranchLine className="size-3.5" />
        <span className="text-foreground font-medium">
          {repo.detached ? `detached @ ${repo.commit}` : repo.head}
        </span>
        {behind > 0 ? (
          <span className="flex items-center gap-0.5">
            <RiArrowDownLine className="size-3" />
            {behind}
          </span>
        ) : null}
        {ahead > 0 ? (
          <span className="flex items-center gap-0.5">
            <RiArrowUpLine className="size-3" />
            {ahead}
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ToolButton
          label="Fetch all remotes"
          icon={<RiDownloadCloud2Line />}
          pending={pending}
          onClick={() => run(gitFetch, "Fetched from remotes")}
        >
          Fetch
        </ToolButton>
        <PullButton
          pending={pending}
          behind={behind}
          onPull={(mode) => run(() => gitPull(mode), "Pulled")}
        />
        <PushButton
          pending={pending}
          ahead={ahead}
          hasUpstream={!!current?.upstream}
          onPush={() => run(gitPush, "Pushed to upstream")}
          onSetUpstream={() =>
            run(gitPushSetUpstream, "Pushed and set upstream")
          }
          onForce={() => run(gitPushForce, "Force-pushed")}
        />

        <MergeMenu
          current={current}
          branches={branches}
          pending={pending}
          onMerge={(name) =>
            run(() => mergeBranch(name), `Merged ${name} into ${current?.name}`)
          }
        />

        <Separator orientation="vertical" className="mx-1 !h-5" />

        <ActionTooltip label="Undo last action (redo via Reflog)">
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            onClick={() => run(() => undoLast(), "Undone")}
          >
            <RiArrowGoBackLine />
          </Button>
        </ActionTooltip>

        <ActionTooltip label="Reflog (HEAD history)">
          <Button asChild variant="ghost" size="icon">
            <Link href="/reflog">
              <RiHistoryLine />
            </Link>
          </Button>
        </ActionTooltip>

        <ActionTooltip label="Pull requests, issues & collaborators">
          <Button asChild variant="ghost" size="sm">
            <Link href="/github">
              <RiGitPullRequestLine />
              Pull Requests
            </Link>
          </Button>
        </ActionTooltip>

        <UpdateChecker />

        <ActionTooltip label="Toggle terminal">
          <Button variant="ghost" size="icon" onClick={toggleTerminal}>
            <RiTerminalBoxLine />
          </Button>
        </ActionTooltip>

        <ActionTooltip label="Identity & signing">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
          >
            <RiSettings3Line />
          </Button>
        </ActionTooltip>

        <ThemeToggle />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={close}>
              <RiCloseLine />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close repository</TooltipContent>
        </Tooltip>
      </div>

      <RepoSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
