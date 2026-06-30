"use client";

import { RiGitRepositoryLine, RiRefreshLine } from "@remixicon/react";
import { submodules, submoduleUpdate } from "@/app/actions";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import { useRepoData } from "@/hooks/use-repo-data";
import { notify } from "@/lib/notify";
import { Section } from "./section";
import { SubmoduleRow } from "./submodule-row";

export function SubmoduleSection() {
  const { data, reload } = useRepoData(submodules);
  const items = data && !("error" in data) ? data.items : [];

  // Repos without submodules are the common case — hide the section entirely.
  if (items.length === 0) return null;

  const updateAll = () =>
    submoduleUpdate().then((r) => {
      notify(r, "Submodules updated");
      if (!("error" in r)) reload();
    });

  return (
    <Section
      icon={<RiGitRepositoryLine />}
      label="Submodules"
      count={items.length}
      action={
        <ActionTooltip label="Update all (init + recursive)">
          <Button variant="ghost" size="icon-xs" onClick={updateAll}>
            <RiRefreshLine />
          </Button>
        </ActionTooltip>
      }
    >
      {items.map((s) => (
        <SubmoduleRow key={s.path} submodule={s} onChanged={reload} />
      ))}
    </Section>
  );
}
