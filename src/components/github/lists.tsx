"use client";

import {
  RiCheckboxCircleFill,
  RiErrorWarningLine,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiTeamLine,
} from "@remixicon/react";
import type { Collaborator, GithubBranch, GithubIssue } from "@shared/types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 [&_svg]:size-8 [&_svg]:opacity-40">
      {icon}
      <p className="text-xs">{text}</p>
    </div>
  );
}

function Avatar({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="ring-border size-7 shrink-0 rounded-full ring-1"
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
      {children}
    </div>
  );
}

export function Collaborators({
  collaborators,
}: {
  collaborators: Collaborator[];
}) {
  if (collaborators.length === 0)
    return <Empty icon={<RiTeamLine />} text="No collaborators." />;
  return (
    <Card>
      {collaborators.map((c) => (
        <a
          key={c.login}
          href={c.url}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2 text-xs transition-colors"
        >
          <Avatar url={c.avatarUrl} />
          <span className="font-medium">{c.login}</span>
          <span className="text-muted-foreground border-border ml-auto rounded-full border px-2 py-0.5 text-[0.625rem] capitalize">
            {c.role}
          </span>
        </a>
      ))}
    </Card>
  );
}

export function Issues({ issues }: { issues: GithubIssue[] }) {
  if (issues.length === 0)
    return <Empty icon={<RiErrorWarningLine />} text="No issues." />;
  return (
    <Card>
      {issues.map((i) => (
        <a
          key={i.number}
          href={i.url}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-muted/40 flex items-start gap-3 px-3 py-2.5 text-xs transition-colors"
        >
          {i.state === "open" ? (
            <RiErrorWarningLine className="mt-0.5 size-4 shrink-0 text-[#3fb950]" />
          ) : (
            <RiCheckboxCircleFill className="mt-0.5 size-4 shrink-0 text-[#8957e5]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{i.title}</div>
            <div className="text-muted-foreground mt-0.5 truncate text-[0.7rem]">
              #{i.number} · {i.author?.login ?? "unknown"} · opened{" "}
              {timeAgo(i.createdAt)}
            </div>
          </div>
          {i.comments > 0 ? (
            <span className="text-muted-foreground shrink-0 text-[0.7rem]">
              {i.comments} 💬
            </span>
          ) : null}
        </a>
      ))}
    </Card>
  );
}

export function Branches({ branches }: { branches: GithubBranch[] }) {
  if (branches.length === 0)
    return <Empty icon={<RiGitRepositoryLine />} text="No branches." />;
  return (
    <Card>
      {branches.map((b) => (
        <div
          key={b.name}
          className="hover:bg-muted/40 flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
        >
          <RiGitBranchLine className="text-muted-foreground size-3.5 shrink-0" />
          <span className={cn("truncate font-medium", b.protected && "text-primary")}>
            {b.name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {b.protected ? (
              <span className="text-muted-foreground border-border rounded-full border px-2 py-0.5 text-[0.625rem]">
                protected
              </span>
            ) : null}
            <span className="text-muted-foreground font-mono text-[0.625rem]">
              {b.sha.slice(0, 7)}
            </span>
          </span>
        </div>
      ))}
    </Card>
  );
}
