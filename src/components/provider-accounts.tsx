"use client";

import { RiGitPullRequestLine, RiLogoutBoxRLine } from "@remixicon/react";
import type { GhStatus } from "@shared/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { usePersistedState } from "@/hooks/use-persisted-state";
import { PROVIDERS, type ProviderKey } from "@/lib/providers";
import { useRouter } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

/** Pick which host to sign in to — one at a time. */
function ProviderPicker({
  selected,
  onSelect,
}: {
  selected: ProviderKey;
  onSelect: (k: ProviderKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PROVIDERS.map((p) => {
        const Icon = p.Icon;
        return (
          <Button
            key={p.key}
            type="button"
            variant={"outline"}
            disabled={p.comingSoon}
            onClick={() => onSelect(p.key)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",

              p.comingSoon && "cursor-not-allowed opacity-50",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{p.label}</span>
            {p.comingSoon ? (
              <span className="text-muted-foreground ml-auto text-[0.65rem]">
                soon
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

/** Sidebar footer account: one connected git host at a time. */
export function ProviderAccounts() {
  const router = useRouter();
  const [selected, setSelected] = usePersistedState<ProviderKey>(
    "opengit.provider",
    "github",
  );
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [launching, setLaunching] = useState<ProviderKey | null>(null);

  const meta = PROVIDERS.find((p) => p.key === selected) ?? PROVIDERS[0];

  // Keep only one credential in the OS keychain — one provider active at a time.
  const clearOthers = (except: ProviderKey) =>
    Promise.all(
      PROVIDERS.filter((p) => p.key !== except).map((p) =>
        window.github.providerClearToken(p.key),
      ),
    );

  // Click a provider → drop the previous account's stored credential, make this
  // one active, and start its login immediately.
  const pick = (k: ProviderKey) => {
    if (k !== selected) window.github.providerClearToken(selected);
    setSelected(k);
    setLaunching(k);
  };

  const load = () => window.github.providerStatus(selected).then(setStatus);
  // Reload when the chosen provider changes (and on mount). Don't null-out status
  // here — that would briefly unmount the whole component (and the open dialog).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  // Browser-login completion arrives as gh:auth — surface + refresh.
  useEffect(() => {
    return window.github.onAuth((s) => {
      if (s.connected) toast.success("Signed in.");
      else if (s.reason) toast.error(s.reason);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (status === null) return null;

  const Icon = meta.Icon;
  const acct = status.connected ? status : null;

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLaunching(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>
            Click a git host to sign in. One account is active at a time; the
            token is stored in your OS keychain.
          </DialogDescription>
        </DialogHeader>

        <ProviderPicker selected={selected} onSelect={pick} />

        <div className="mt-1">
          {launching ? (
            // Browser flow auto-starts; PAT fallback lives inside the form.
            <GithubSignIn
              key={launching}
              provider={launching}
              autoStart
              onConnected={async () => {
                // Guarantee a single stored credential after a successful login.
                await clearOthers(launching);
                setLaunching(null);
                setOpen(false);
                load();
              }}
            />
          ) : acct ? (
            <div className="border-border flex items-center gap-2 rounded-md border p-3 text-sm">
              <GhAvatar url={acct.avatarUrl} login={acct.login} />
              <span className="flex-1 truncate font-medium">{acct.login}</span>
              <button
                type="button"
                onClick={async () => {
                  await window.github.providerClearToken(selected);
                  load();
                }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!acct)
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
        >
          <Icon className="size-4 shrink-0" />
          Sign in to {meta.label}
        </button>
        {dialog}
      </>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
          >
            <GhAvatar url={acct.avatarUrl} login={acct.login} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {acct.login}
            </span>
            <Icon className="text-muted-foreground size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" align="start" className="w-56">
          <DropdownMenuItem onSelect={() => router.push("/github")}>
            <RiGitPullRequestLine /> Pull requests
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <Icon /> Switch account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              await window.github.providerClearToken(selected);
              load();
            }}
          >
            <RiLogoutBoxRLine /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}
