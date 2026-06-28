"use client";

import {
  RiGithubFill,
  RiGitPullRequestLine,
  RiLogoutBoxRLine,
} from "@remixicon/react";
import type { GhStatus } from "@shared/types";
import { useEffect, useState } from "react";
import { GhAvatar } from "@/components/gh-avatar";
import { GithubSignIn } from "@/components/github-signin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/lib/router";

/** GitHub account chip for the sidebar footer: avatar + sign out, or sign in
 * in place (no navigation). The token is shared with the PR page. */
export function GithubAccount() {
  const router = useRouter();
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [signIn, setSignIn] = useState(false);

  const load = () => window.github.tokenStatus().then(setStatus);
  useEffect(() => {
    load();
  }, []);

  if (status === null) return null;

  if (!status.connected)
    return (
      <>
        <button
          type="button"
          onClick={() => setSignIn(true)}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
        >
          <RiGithubFill className="size-4 shrink-0" />
          Sign in to GitHub
        </button>
        <Dialog open={signIn} onOpenChange={setSignIn}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RiGithubFill className="size-5" />
                Sign in to GitHub
              </DialogTitle>
              <DialogDescription>
                Connect to manage pull requests and clone your repositories.
              </DialogDescription>
            </DialogHeader>
            <GithubSignIn
              onConnected={() => {
                setSignIn(false);
                load();
              }}
            />
          </DialogContent>
        </Dialog>
      </>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
        >
          <GhAvatar url={status.avatarUrl} login={status.login} />
          <span className="min-w-0 flex-1 truncate font-medium">
            {status.login}
          </span>
          <RiGithubFill className="text-muted-foreground size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="right" align="start" className="w-56">
        <DropdownMenuItem onSelect={() => router.push("/github")}>
          <RiGitPullRequestLine /> Pull requests
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await window.github.clearToken();
            load();
          }}
        >
          <RiLogoutBoxRLine /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
