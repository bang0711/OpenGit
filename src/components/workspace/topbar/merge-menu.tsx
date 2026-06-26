"use client";

import { RiGitMergeLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Branch } from "@/lib/git";
import { MergeLabel } from "./merge-label";

export function MergeMenu({
  current,
  branches,
  pending,
  onMerge,
}: {
  current: Branch | null;
  branches: Branch[];
  pending: boolean;
  onMerge: (name: string) => void;
}) {
  // Everything except the branch we're currently on.
  const others = branches.filter((b) => !b.isCurrent);
  const local = others.filter((b) => !b.isRemote);
  const remote = others.filter((b) => b.isRemote);
  const disabled = pending || !current || others.length === 0;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled}>
              <RiGitMergeLine />
              Merge
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {current
            ? `Merge a branch into ${current.name}`
            : "No current branch"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-56 overflow-y-auto"
      >
        <DropdownMenuLabel>
          Merge a branch into{" "}
          <span className="text-foreground font-semibold">{current?.name}</span>
        </DropdownMenuLabel>
        {local.map((b) => (
          <DropdownMenuItem key={b.fullName} onSelect={() => onMerge(b.name)}>
            <RiGitMergeLine className="mr-2 size-3.5" />
            <MergeLabel source={b.name} target={current?.name} />
          </DropdownMenuItem>
        ))}
        {remote.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground">
              Remotes
            </DropdownMenuLabel>
            {remote.map((b) => (
              <DropdownMenuItem
                key={b.fullName}
                onSelect={() => onMerge(b.name)}
              >
                <RiGitMergeLine className="mr-2 size-3.5" />
                <MergeLabel source={b.name} target={current?.name} />
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
