"use client";

import {
  RiGithubFill,
  RiLoader4Line,
  RiLockLine,
  RiSearchLine,
} from "@remixicon/react";
import type { GhRepo, GhStatus } from "@shared/types";
import { useEffect, useState } from "react";
import { GithubSignIn } from "@/components/github-signin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { timeAgo } from "@/lib/time";

/** Pick a repository from the signed-in GitHub account; returns its clone URL. */
export function GithubRepoDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (repo: GhRepo) => void;
}) {
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");

  const loadRepos = async () => {
    setLoading(true);
    const r = await window.github.listMyRepos();
    setLoading(false);
    if ("error" in r) setError(r.error);
    else {
      setRepos(r);
      setError(undefined);
    }
  };

  const init = async () => {
    const s = await window.github.tokenStatus();
    setStatus(s);
    if (s.connected) loadRepos();
  };

  useEffect(() => {
    if (open) {
      setQuery("");
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-lg!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RiGithubFill className="size-5" />
            Clone from GitHub
          </DialogTitle>
          <DialogDescription>
            {status?.connected
              ? `Signed in as ${status.login}. Pick a repository to clone.`
              : "Sign in to list and clone your repositories."}
          </DialogDescription>
        </DialogHeader>

        {status === null ? (
          <div className="text-muted-foreground flex h-40 items-center justify-center">
            <RiLoader4Line className="size-5 animate-spin" />
          </div>
        ) : !status.connected ? (
          <GithubSignIn
            onConnected={() => {
              setError(undefined);
              init();
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <RiSearchLine className="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories…"
                autoComplete="off"
                spellCheck={false}
                className="pl-8"
              />
            </div>
            <ScrollArea className="border-border h-80 w-full rounded-md border">
              {loading ? (
                <div className="text-muted-foreground flex h-80 items-center justify-center">
                  <RiLoader4Line className="size-5 animate-spin" />
                </div>
              ) : error ? (
                <p className="text-destructive p-4 text-xs">{error}</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground p-4 text-xs">
                  No repositories found.
                </p>
              ) : (
                <div className="p-1">
                  {filtered.map((r) => (
                    <button
                      key={r.fullName}
                      type="button"
                      onClick={() => {
                        onPick(r);
                        onOpenChange(false);
                      }}
                      className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="max-w-xs truncate font-medium">
                            {r.fullName}
                          </span>
                          {r.private ? (
                            <RiLockLine className="text-muted-foreground size-3 shrink-0" />
                          ) : null}
                        </div>
                        {r.description ? (
                          <p className="text-muted-foreground max-w-xs truncate text-[0.7rem]">
                            {r.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground shrink-0 text-[0.625rem]">
                        {timeAgo(r.updatedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
