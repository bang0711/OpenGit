"use client";

import {
  RiArrowDownLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiGitCommitLine,
  RiGitMergeLine,
  RiLoader4Line,
} from "@remixicon/react";
import { useEffect, useState } from "react";
import type { PullMode } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PULL_OPTIONS: {
  mode: PullMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: "ff-or-merge",
    label: "Fast-forward if possible",
    description: "Fast-forward, or merge when histories diverged",
    icon: <RiGitMergeLine className="size-3.5" />,
  },
  {
    mode: "ff",
    label: "Fast-forward only",
    description: "Fail if a merge would be required",
    icon: <RiArrowDownLine className="size-3.5" />,
  },
  {
    mode: "rebase",
    label: "Pull with rebase",
    description: "Replay your local commits on top of upstream",
    icon: <RiGitCommitLine className="size-3.5" />,
  },
];

const PULL_PREF_KEY = "opengit.pullMode";
const DEFAULT_PULL: PullMode = "ff-or-merge";

export function PullButton({
  pending,
  behind,
  onPull,
}: {
  pending: boolean;
  behind: number;
  onPull: (mode: PullMode) => void;
}) {
  const [defaultMode, setDefaultMode] = useState<PullMode>(DEFAULT_PULL);

  // Restore the saved default after mount (avoids SSR/client mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(PULL_PREF_KEY) as PullMode | null;
    if (saved && PULL_OPTIONS.some((o) => o.mode === saved)) {
      setDefaultMode(saved);
    }
  }, []);

  // Selecting an option both runs it and makes it the new default action.
  const choose = (mode: PullMode) => {
    setDefaultMode(mode);
    localStorage.setItem(PULL_PREF_KEY, mode);
    onPull(mode);
  };

  const current =
    PULL_OPTIONS.find((o) => o.mode === defaultMode) ?? PULL_OPTIONS[0];

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onPull(defaultMode)}
            className="rounded-r-none pr-1.5"
          >
            {pending ? (
              <RiLoader4Line className="animate-spin" />
            ) : (
              <RiArrowDownLine />
            )}
            Pull
            {behind ? (
              <Badge variant="secondary" className="ml-0.5">
                {behind}
              </Badge>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Pull — {current.label}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pending}
            title="Pull options"
            className="rounded-l-none"
          >
            <RiArrowDownSLine />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Pull behaviour (sets default)</DropdownMenuLabel>
          {PULL_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.mode}
              onSelect={() => choose(opt.mode)}
              className="items-start gap-2"
            >
              <span className="mt-0.5">{opt.icon}</span>
              <span className="flex flex-1 flex-col">
                <span>{opt.label}</span>
                <span className="text-muted-foreground text-[0.625rem]">
                  {opt.description}
                </span>
              </span>
              {opt.mode === defaultMode ? (
                <RiCheckLine className="text-primary mt-0.5 size-3.5" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
