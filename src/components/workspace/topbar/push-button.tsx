"use client";

import {
  RiArrowDownSLine,
  RiArrowUpLine,
  RiGitBranchLine,
  RiLoader4Line,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
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

export function PushButton({
  pending,
  ahead,
  hasUpstream,
  onPush,
  onSetUpstream,
  onForce,
}: {
  pending: boolean;
  ahead: number;
  hasUpstream: boolean;
  onPush: () => void;
  onSetUpstream: () => void;
  onForce: () => void;
}) {
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={hasUpstream ? onPush : onSetUpstream}
            className="rounded-r-none pr-1.5"
          >
            {pending ? (
              <RiLoader4Line className="animate-spin" />
            ) : (
              <RiArrowUpLine />
            )}
            Push
            {ahead ? (
              <Badge variant="secondary" className="ml-0.5">
                {ahead}
              </Badge>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasUpstream ? "Push to upstream" : "Push and set upstream"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pending}
            title="Push options"
            className="rounded-l-none border-l-0"
          >
            <RiArrowDownSLine />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Push options</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onPush}>
            <RiArrowUpLine className="mr-2 size-3.5" />
            Push
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSetUpstream}>
            <RiGitBranchLine className="mr-2 size-3.5" />
            Push &amp; set upstream (origin)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={onForce}>
            <RiArrowUpLine className="mr-2 size-3.5" />
            Force push (--force-with-lease)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
