"use client";

import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiCloseLine,
  RiDownloadCloud2Line,
  RiGitBranchLine,
} from "@remixicon/react";
import { useTransition } from "react";
import {
  type ActionState,
  closeRepo,
  gitFetch,
  gitPull,
  gitPush,
  gitPushForce,
  gitPushSetUpstream,
  mergeBranch,
} from "@/app/actions";
import { GitLogo } from "@/components/git-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
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

  const run = (action: () => Promise<ActionState>, success: string) => {
    startTransition(async () => {
      notify(await action(), success);
    });
  };

  const close = () => startTransition(() => closeRepo());

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

        <UpdateChecker />
        <ThemeSwitcher />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={close}>
              <RiCloseLine />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close repository</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
