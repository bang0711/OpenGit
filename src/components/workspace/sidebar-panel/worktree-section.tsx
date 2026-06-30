"use client";

import { RiAddLine, RiFolderLine } from "@remixicon/react";
import { useState } from "react";
import { worktrees } from "@/app/actions";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import { useRepoData } from "@/hooks/use-repo-data";
import { Section } from "./section";
import { WorktreeAddDialog } from "./worktree-add-dialog";
import { WorktreeRow } from "./worktree-row";

export function WorktreeSection() {
  const { data, reload } = useRepoData(worktrees);
  const items = data && !("error" in data) ? data.items : [];
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <Section
        icon={<RiFolderLine />}
        label="Worktrees"
        count={items.length}
        action={
          <ActionTooltip label="Add worktree">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setAddOpen(true)}
            >
              <RiAddLine />
            </Button>
          </ActionTooltip>
        }
      >
        {items.map((w) => (
          <WorktreeRow key={w.path} wt={w} onChanged={reload} />
        ))}
      </Section>
      <WorktreeAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onChanged={reload}
      />
    </>
  );
}
