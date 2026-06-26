"use client";

import { RiLoader4Line, RiSave3Line } from "@remixicon/react";
import { useEffect, useState, useTransition } from "react";
import { conflictVersions } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import type { ConflictVersions } from "@/lib/git";
import { Side } from "./side";

export function FilePane({
  file,
  pending,
  onOurs,
  onTheirs,
  onSave,
}: {
  file: string;
  pending: boolean;
  onOurs: () => void;
  onTheirs: () => void;
  onSave: (content: string) => void;
}) {
  const [data, setData] = useState<ConflictVersions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const r = await conflictVersions(file);
      if ("error" in r) {
        setError(r.error);
      } else {
        setError(null);
        setData(r);
        setDraft(r.working);
      }
    });
  }, [file]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <span className="truncate font-mono text-xs">{file}</span>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={onOurs}
          >
            Use ours
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={onTheirs}
          >
            Use theirs
          </Button>
        </div>
      </div>

      {error ? (
        <p className="p-3 text-xs text-destructive">{error}</p>
      ) : loading && !data ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
        </div>
      ) : (
        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="60%" minSize="20%">
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel defaultSize="50%" minSize="20%">
                <Side title="Current (ours)" text={data?.ours} />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="50%" minSize="20%">
                <Side title="Incoming (theirs)" text={data?.theirs} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="40%" minSize="15%">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-7 shrink-0 items-center gap-2 border-y border-border bg-card px-3 text-xs font-semibold text-muted-foreground">
                Resolved result (edit, then save)
                <Button
                  size="xs"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => onSave(draft)}
                >
                  <RiSave3Line />
                  Save resolution
                </Button>
              </div>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0"
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
