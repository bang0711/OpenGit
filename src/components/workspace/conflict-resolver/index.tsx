"use client";

import {
  RiArrowLeftLine,
  RiCheckLine,
  RiCloseCircleLine,
  RiGitMergeLine,
  RiLoader4Line,
} from "@remixicon/react";
import { ActionTooltip } from "@/components/action-tooltip";
import Link from "@/lib/link";
import { useRouter } from "@/lib/router";
import { useEffect, useState, useTransition } from "react";
import {
  type ActionState,
  abortMerge,
  continueMerge,
  resolveOurs,
  resolveTheirs,
  saveResolution,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { FilePane } from "./file-pane";

export function ConflictResolver({
  files,
  inRebase,
}: {
  files: string[];
  inRebase: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(files[0] ?? null);
  const [pending, startTransition] = useTransition();

  // Keep a valid selection as files get resolved out of the list.
  useEffect(() => {
    if (selected && files.includes(selected)) return;
    setSelected(files[0] ?? null);
  }, [files, selected]);

  const run = (action: () => Promise<ActionState>, success: string) =>
    startTransition(async () => {
      const r = await action();
      notify(r, success);
      if (!r?.error) router.refresh();
    });

  const finish = (action: () => Promise<ActionState>, success: string) =>
    startTransition(async () => {
      const r = await action();
      notify(r, success);
      if (!r?.error) router.push("/");
    });

  return (
    <div className="bg-background flex h-screen flex-col">
      <header className="border-border bg-card flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <RiArrowLeftLine />
            Back
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-xs">
          <RiGitMergeLine className="size-4 text-amber-500" />
          <span className="font-medium">
            Resolve conflicts · {inRebase ? "rebase" : "merge"}
          </span>
          <span className="text-muted-foreground">
            {files.length} remaining
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => finish(abortMerge, "Aborted")}
          >
            <RiCloseCircleLine />
            Abort
          </Button>
          <Button
            size="sm"
            disabled={pending || files.length > 0}
            onClick={() => finish(continueMerge, "Merge completed")}
          >
            {pending ? (
              <RiLoader4Line className="animate-spin" />
            ) : (
              <RiCheckLine />
            )}
            Continue
          </Button>
        </div>
      </header>

      {files.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          All conflicts resolved — click <b className="mx-1">Continue</b> to
          finish.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="border-border bg-sidebar relative w-64 shrink-0 border-r">
            <ScrollArea className="inset-0 h-full">
              <div className="py-1 text-xs">
                {files.map((f) => (
                  <ActionTooltip key={f} label={f} side="right">
                    <button
                      type="button"
                      onClick={() => setSelected(f)}
                      className={cn(
                        "flex w-full items-center gap-1.5 px-3 py-1 text-left",
                        f === selected
                          ? "bg-primary/15 text-foreground"
                          : "text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      <RiGitMergeLine className="size-3.5 shrink-0 text-amber-500" />
                      <span className="truncate">{f}</span>
                    </button>
                  </ActionTooltip>
                ))}
              </div>
            </ScrollArea>
          </aside>

          {selected ? (
            <FilePane
              key={selected}
              file={selected}
              pending={pending}
              onOurs={() =>
                run(
                  () => resolveOurs(selected),
                  `Took your version of ${selected}`,
                )
              }
              onTheirs={() =>
                run(
                  () => resolveTheirs(selected),
                  `Took incoming version of ${selected}`,
                )
              }
              onSave={(content) =>
                run(
                  () => saveResolution(selected, content),
                  `Resolved ${selected}`,
                )
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
