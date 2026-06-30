"use client";

import {
  RiAddLine,
  RiDeleteBinLine,
  RiDownloadCloud2Line,
  RiFolderZipLine,
} from "@remixicon/react";
import { useState } from "react";
import { lfsInfo, lfsPull, lfsTrack, lfsUntrack } from "@/app/actions";
import { ActionTooltip } from "@/components/action-tooltip";
import { NameDialog } from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useRepoData } from "@/hooks/use-repo-data";
import { notify } from "@/lib/notify";
import { Section } from "./section";

export function LfsSection() {
  const { data, reload } = useRepoData(lfsInfo);
  const [trackOpen, setTrackOpen] = useState(false);

  // git-lfs not installed → nothing to manage.
  if (!data || "error" in data || !data.installed) return null;

  const run = (fn: () => Promise<{ error?: string }>, success: string) =>
    fn().then((r) => {
      notify(r, success);
      if (!("error" in r)) reload();
    });

  return (
    <>
      <Section
        icon={<RiFolderZipLine />}
        label="Git LFS"
        count={data.patterns.length}
        action={
          <div className="flex items-center">
            <ActionTooltip label="Pull LFS objects">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => run(() => lfsPull(), "Pulled LFS objects")}
              >
                <RiDownloadCloud2Line />
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Track a pattern">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setTrackOpen(true)}
              >
                <RiAddLine />
              </Button>
            </ActionTooltip>
          </div>
        }
      >
        {data.patterns.map((p) => (
          <ContextMenu key={p}>
            <ContextMenuTrigger asChild>
              <div className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs hover:bg-sidebar-accent">
                <span className="truncate font-mono">{p}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
              <ContextMenuItem
                className="text-destructive"
                onSelect={() => run(() => lfsUntrack(p), `Untracked ${p}`)}
              >
                <RiDeleteBinLine className="mr-2 size-3.5" />
                Untrack
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </Section>

      <NameDialog
        open={trackOpen}
        onOpenChange={setTrackOpen}
        title="Track with Git LFS"
        description="A glob pattern, e.g. *.psd or assets/**"
        label="Pattern"
        placeholder="*.psd"
        submitLabel="Track"
        onSubmit={(pat) => {
          if (pat.trim()) run(() => lfsTrack(pat.trim()), `Tracking ${pat}`);
        }}
      />
    </>
  );
}
