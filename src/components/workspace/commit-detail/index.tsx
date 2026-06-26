"use client";

import { RiGitCommitLine, RiLoader4Line, RiUser3Line } from "@remixicon/react";
import { useEffect, useState, useTransition } from "react";
import { commitDetail } from "@/app/actions";
import { Notice } from "@/components/shared/notice";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CommitDetail } from "@/lib/git";
import { FileRow } from "./file-row";

export function CommitDetailPane({ sha }: { sha: string | null }) {
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!sha) {
      setDetail(null);
      setError(null);
      return;
    }
    startTransition(async () => {
      const r = await commitDetail(sha);
      if ("error" in r) {
        setError(r.error);
        setDetail(null);
      } else {
        setError(null);
        setDetail(r);
      }
    });
  }, [sha]);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-border text-muted-foreground flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs font-semibold">
        <RiGitCommitLine className="size-3.5" />
        Commit
        {detail ? (
          <span className="font-mono font-normal">{detail.shortSha}</span>
        ) : null}
        {pending ? (
          <RiLoader4Line className="ml-auto size-3.5 animate-spin" />
        ) : null}
      </div>

      {!sha ? (
        <Notice className="p-4 text-xs">
          Select a commit to view its details.
        </Notice>
      ) : error ? (
        <p className="text-destructive p-3 text-xs">{error}</p>
      ) : detail ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3">
            <p className="text-sm leading-snug font-medium">{detail.subject}</p>
            {detail.body ? (
              <pre className="text-muted-foreground border-border/60 border-l-2 pl-3 font-sans text-xs whitespace-pre-wrap">
                {detail.body}
              </pre>
            ) : null}

            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <RiUser3Line className="size-3.5" />
                <span className="text-foreground">{detail.authorName}</span>
                <span className="truncate">&lt;{detail.authorEmail}&gt;</span>
              </div>
              <div className="text-muted-foreground">
                {new Date(detail.date * 1000).toLocaleString()}
              </div>
              <div className="text-muted-foreground flex items-center gap-1">
                <span>commit</span>
                <span className="text-foreground font-mono">
                  {detail.shortSha}
                </span>
                {detail.parents.length > 0 ? (
                  <span>
                    · parents{" "}
                    <span className="font-mono">
                      {detail.parents.map((p) => p.slice(0, 7)).join(" ")}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Files
              <Badge variant="secondary">{detail.files.length}</Badge>
            </div>
            <div className="flex flex-col">
              {detail.files.map((f) => (
                <FileRow key={f.path} file={f} sha={detail.sha} />
              ))}
            </div>
          </div>
        </ScrollArea>
      ) : (
        <Notice className="p-4 text-xs">
          <RiLoader4Line className="size-5 animate-spin" />
        </Notice>
      )}
    </div>
  );
}
