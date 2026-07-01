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
import { PROVIDERS, type ProviderKey } from "@/lib/providers";

/**
 * Sign-in for one git host. Default (no `provider`) = GitHub via the active-repo
 * routing, preserving every existing call site. Pass `provider` to target a
 * specific host through the provider-explicit bridge ops (accounts panel).
 */
export function GithubSignIn({
  onConnected,
  provider,
  autoStart,
}: {
  onConnected: () => void;
  provider?: ProviderKey;
  /** Kick off the browser flow immediately on mount (device/loopback hosts). */
  autoStart?: boolean;
}) {
  const meta = PROVIDERS.find((p) => p.key === provider);
  const label = meta?.label ?? "GitHub";
  const Icon = meta?.Icon ?? RiGithubFill;
  const hasDevice = provider ? meta?.device : true;

  // Bridge ops: provider-explicit when targeting a host, else the legacy
  // active-routed GitHub ops.
  const deviceStart = () =>
    provider
      ? window.github.providerDeviceStart(provider)
      : window.github.deviceStart();
  const setToken = (t: string) =>
    provider
      ? window.github.providerSetToken(provider, t)
      : window.github.setToken(t);

  // Non-github providers are PAT-only: skip the device button entirely.
  const [phase, setPhase] = useState<"idle" | "waiting" | "token">(
    hasDevice ? "idle" : "token",
  );
  const [code, setCode] = useState<{ userCode?: string; uri: string }>();
  const [token, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const connected = useRef(onConnected);
  connected.current = onConnected;

  // Device flow completes in the backend; it pushes a gh:auth event (GitHub only).
  useEffect(() => {
    if (!hasDevice) return;
    return window.github.onAuth((status: GhStatus) => {
      if (status.connected) connected.current();
      else setError(status.reason ?? "Login failed.");
    });
  }, [hasDevice]);

  const startDevice = async () => {
    setBusy(true);
    setError(undefined);
    const r = await deviceStart();
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      setPhase("token"); // fall back to token entry
      return;
    }
    setCode({ userCode: r.userCode, uri: r.verificationUri });
    setPhase("waiting");
  };

  // Launch the browser flow right away when asked (a provider was clicked).
  // Ref-guarded so React StrictMode's double-invoke doesn't open two tabs.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && hasDevice && !autoStarted.current) {
      autoStarted.current = true;
      startDevice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectToken = async () => {
    if (busy || !token.trim()) return;
    setBusy(true);
    setError(undefined);
    const s = (await setToken(token.trim())) as GhStatus;
    setBusy(false);
    if (s.connected) connected.current();
    else setError(s.reason ?? "Invalid token.");
  };

  if (phase === "waiting" && code)
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {code.userCode ? (
          <>
            <p className="text-muted-foreground text-xs">
              Enter this code on {label} to finish signing in:
            </p>
            <div className="flex items-center gap-1">
              <span className="bg-muted rounded-md px-3 py-1.5 font-mono text-lg font-semibold tracking-widest">
                {code.userCode}
              </span>
              <CopyButton text={code.userCode} label="code" />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            Authorize OpenGit in the {label} tab that just opened.
          </p>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href={code.uri} target="_blank" rel="noreferrer">
            <RiExternalLinkLine /> Continue in browser
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
          {busy ? <RiLoader4Line className="animate-spin" /> : <Icon />}
          Sign in with {label}
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
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={meta?.tokenHint ?? "Personal access token (repo scope)"}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={busy || !token.trim()}>
            {busy ? <RiLoader4Line className="animate-spin" /> : <Icon />}
            Connect
          </Button>
          {meta ? (
            <a
              href={meta.tokenUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
            >
              <RiExternalLinkLine className="size-3" /> Create a token on {label}
            </a>
          ) : null}
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
