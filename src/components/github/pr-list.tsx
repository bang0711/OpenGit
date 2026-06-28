"use client";

import { RiChat3Line, RiGitPullRequestLine } from "@remixicon/react";
import type { PullRequest } from "@shared/types";
import { useState } from "react";
import { GhAvatar } from "@/components/gh-avatar";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { prState } from "./status";

type Filter = "open" | "closed" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const matches = (pr: PullRequest, f: Filter) =>
  f === "all" ? true : f === "open" ? pr.state === "open" : pr.state === "closed";

export function PrList({
  prs,
  selected,
  onSelect,
}: {
  prs: PullRequest[];
  selected?: number | null;
  onSelect: (n: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const shown = prs.filter((pr) => matches(pr, filter));
  const counts = {
    open: prs.filter((p) => p.state === "open").length,
    closed: prs.filter((p) => p.state === "closed").length,
    all: prs.length,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
            <span className="ml-1 opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-12">
          <RiGitPullRequestLine className="size-8 opacity-40" />
          <p className="text-xs">No {filter === "all" ? "" : filter} pull requests.</p>
        </div>
      ) : (
        <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
          {shown.map((pr) => (
            <PrRow
              key={pr.number}
              pr={pr}
              active={pr.number === selected}
              onClick={() => onSelect(pr.number)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PrRow({
  pr,
  active,
  onClick,
}: {
  pr: PullRequest;
  active: boolean;
  onClick: () => void;
}) {
  const verb =
    prState(pr) === "merged"
      ? "merged"
      : pr.state === "closed"
        ? "closed"
        : "opened";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
        active ? "bg-primary/10" : "hover:bg-muted/40",
      )}
    >
      <GhAvatar
        url={pr.author?.avatarUrl}
        login={pr.author?.login}
        className="size-7"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.8rem] font-medium">{pr.title}</span>
          {pr.draft ? (
            <Badge variant="outline" className="shrink-0">
              Draft
            </Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-[0.7rem]">
          #{pr.number} · {pr.author?.login ?? "unknown"} {verb} {timeAgo(pr.createdAt)}
          {" · "}
          <span className="font-mono">{pr.head}</span> →{" "}
          <span className="font-mono">{pr.base}</span>
        </div>
      </div>
      {pr.comments > 0 ? (
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[0.7rem]">
          <RiChat3Line className="size-3.5" />
          {pr.comments}
        </span>
      ) : null}
    </button>
  );
}
