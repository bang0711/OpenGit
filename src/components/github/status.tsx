import {
  RiCheckboxCircleFill,
  RiCloseCircleFill,
  RiGitMergeFill,
  RiGitPullRequestFill,
  RiLoader4Line,
} from "@remixicon/react";
import type { PrCheck, PullRequest } from "@shared/types";
import { cn } from "@/lib/utils";

export type PrState = "open" | "merged" | "closed";

export function prState(pr: Pick<PullRequest, "state" | "merged">): PrState {
  if (pr.merged) return "merged";
  return pr.state === "closed" ? "closed" : "open";
}

// GitHub's state colors, used for icons + accents throughout the panel.
const STATE = {
  open: { fg: "text-[#3fb950]", bg: "bg-[#3fb950]/12", label: "Open" },
  merged: { fg: "text-[#a371f7]", bg: "bg-[#a371f7]/12", label: "Merged" },
  closed: { fg: "text-[#f85149]", bg: "bg-[#f85149]/12", label: "Closed" },
} as const;

export function PrIcon({
  pr,
  className,
}: {
  pr: Pick<PullRequest, "state" | "merged">;
  className?: string;
}) {
  const s = prState(pr);
  const Icon = s === "merged" ? RiGitMergeFill : RiGitPullRequestFill;
  return <Icon className={cn("shrink-0", STATE[s].fg, className)} />;
}

export function StateBadge({
  pr,
}: {
  pr: Pick<PullRequest, "state" | "merged">;
}) {
  const s = prState(pr);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold",
        STATE[s].bg,
        STATE[s].fg,
      )}
    >
      <PrIcon pr={pr} className="size-3" />
      {STATE[s].label}
    </span>
  );
}

export function checkColor(conclusion: string | null): string {
  if (conclusion === "success") return "text-[#3fb950]";
  if (conclusion === "failure" || conclusion === "timed_out")
    return "text-[#f85149]";
  return "text-muted-foreground";
}

/** Small rolled-up CI status icon for a PR's check runs. */
export function ChecksSummary({ checks }: { checks: PrCheck[] }) {
  if (checks.length === 0) return null;
  const done = checks.filter((c) => c.status === "completed");
  const failed = done.some(
    (c) => c.conclusion === "failure" || c.conclusion === "timed_out",
  );
  const pending = done.length < checks.length;
  if (pending)
    return <RiLoader4Line className="text-muted-foreground size-3.5 animate-spin" />;
  if (failed) return <RiCloseCircleFill className="size-3.5 text-[#f85149]" />;
  return <RiCheckboxCircleFill className="size-3.5 text-[#3fb950]" />;
}
