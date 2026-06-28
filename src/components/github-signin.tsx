"use client";

import {
  RiExternalLinkLine,
  RiGithubFill,
  RiLoader4Line,
} from "@remixicon/react";
import type { GhStatus } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** GitHub sign-in: OAuth Device Flow (primary) + personal-access-token fallback. */
export function GithubSignIn({ onConnected }: { onConnected: () => void }) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "token">("idle");
  const [code, setCode] = useState<{ userCode: string; uri: string }>();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const connected = useRef(onConnected);
  connected.current = onConnected;

  // Device flow completes in the main process; it pushes a gh:auth event.
  useEffect(() => {
    return window.github.onAuth((status: GhStatus) => {
      if (status.connected) connected.current();
      else setError(status.reason ?? "Login failed.");
    });
  }, []);

  const startDevice = async () => {
    setBusy(true);
    setError(undefined);
    const r = await window.github.deviceStart();
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      setPhase("token"); // fall back to token entry
      return;
    }
    setCode({ userCode: r.userCode, uri: r.verificationUri });
    setPhase("waiting");
  };

  const connectToken = async () => {
    if (busy || !token.trim()) return;
    setBusy(true);
    setError(undefined);
    const s = (await window.github.setToken(token.trim())) as GhStatus;
    setBusy(false);
    if (s.connected) connected.current();
    else setError(s.reason ?? "Invalid token.");
  };

  if (phase === "waiting" && code)
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <p className="text-muted-foreground text-xs">
          Enter this code on GitHub to finish signing in:
        </p>
        <div className="flex items-center gap-1">
          <span className="bg-muted rounded-md px-3 py-1.5 font-mono text-lg font-semibold tracking-widest">
            {code.userCode}
          </span>
          <CopyButton text={code.userCode} label="code" />
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={code.uri} target="_blank" rel="noreferrer">
            <RiExternalLinkLine /> Open github.com/login/device
          </a>
        </Button>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <RiLoader4Line className="size-3.5 animate-spin" />
          Waiting for authorization…
        </p>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {phase !== "token" ? (
        <Button onClick={startDevice} disabled={busy}>
          {busy ? <RiLoader4Line className="animate-spin" /> : <RiGithubFill />}
          Sign in with GitHub
        </Button>
      ) : null}

      {phase === "token" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            connectToken();
          }}
          className="flex flex-col gap-2"
        >
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Personal access token (repo scope)"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={busy || !token.trim()}>
            {busy ? (
              <RiLoader4Line className="animate-spin" />
            ) : (
              <RiGithubFill />
            )}
            Connect
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(undefined);
            setPhase("token");
          }}
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
        >
          Use a personal access token instead
        </button>
      )}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
