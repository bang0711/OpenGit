"use client";

import { RiGithubLine, RiLoader4Line } from "@remixicon/react";
import type { GhStatus } from "@shared/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectForm({
  reason,
  onConnected,
}: {
  reason?: string;
  onConnected: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(reason);

  const connect = async () => {
    if (busy || !token.trim()) return;
    setBusy(true);
    setError(undefined);
    const status = (await window.github.setToken(token.trim())) as GhStatus;
    setBusy(false);
    if (status.connected) onConnected();
    else setError(status.reason ?? "Invalid token.");
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <RiGithubLine className="size-5" />
            <CardTitle className="text-base">Connect to GitHub</CardTitle>
          </div>
          <CardDescription>
            Paste a Personal Access Token to manage pull requests, issues, and
            collaborators. It is stored encrypted on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connect();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gh-token">Personal access token</Label>
              <Input
                id="gh-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_…"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-muted-foreground text-[0.7rem]">
                Needs <code>repo</code> scope (and <code>read:org</code> for
                org collaborators). Create one at github.com → Settings →
                Developer settings → Tokens.
              </p>
            </div>
            {error ? (
              <p className="text-destructive text-xs">{error}</p>
            ) : null}
            <Button type="submit" disabled={busy || !token.trim()}>
              {busy ? <RiLoader4Line className="animate-spin" /> : <RiGithubLine />}
              Connect
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
