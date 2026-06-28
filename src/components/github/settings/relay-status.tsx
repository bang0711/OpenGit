"use client";

import { RiFlashlightLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RealtimeStatus } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<RealtimeStatus, { label: string; cls: string }> = {
  off: { label: "Off", cls: "text-muted-foreground bg-muted" },
  connecting: { label: "Connecting…", cls: "text-amber-500 bg-amber-500/10" },
  live: { label: "Live", cls: "text-[#3fb950] bg-[#3fb950]/12" },
  error: { label: "Disconnected", cls: "text-[#f85149] bg-[#f85149]/12" },
};

export function RelayStatus({
  relayUrl,
  status,
  repo,
  onSave,
}: {
  relayUrl: string;
  status: RealtimeStatus;
  repo: string;
  onSave: (url: string) => void;
}) {
  const [draft, setDraft] = useState(relayUrl);
  useEffect(() => setDraft(relayUrl), [relayUrl]);
  const dirty = draft.trim() !== relayUrl.trim();
  const s = STATUS_STYLE[status];

  return (
    <section className="border-border space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <RiFlashlightLine className="size-4" />
        <h2 className="text-sm font-semibold">Real-time updates</h2>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[0.625rem] font-semibold",
            s.cls,
          )}
        >
          {s.label}
        </span>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        By default the PR page only refreshes when you press Refresh. To get live
        updates the moment a pull request changes, run a tiny relay server that
        receives GitHub's webhooks and forwards them here. It's a one-time setup
        (~10 min) and needs admin access to the repo.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="relay-url">Relay URL</Label>
        <div className="flex gap-2">
          <Input
            id="relay-url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://your-relay.example.com"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <Button disabled={!dirty} onClick={() => onSave(draft.trim())}>
            Save
          </Button>
          {relayUrl ? (
            <Button variant="outline" onClick={() => onSave("")}>
              Clear
            </Button>
          ) : null}
        </div>
        {repo ? (
          <p className="text-muted-foreground text-[0.7rem]">
            Subscribed repo: <span className="font-mono">{repo}</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-[0.7rem]">
            Open a GitHub repository to enable real-time updates.
          </p>
        )}
      </div>
    </section>
  );
}
