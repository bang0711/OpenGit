"use client";

import { useEffect, useState } from "react";
import {
  fetchTags,
  gitFetch,
  gitPull,
  gitPush,
  stashPush,
} from "@/app/actions";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { notify } from "@/lib/notify";
import { setTheme } from "@/lib/theme";

type Cmd = { id: string; label: string; group: string; run: () => void };

// Hash-router navigation works without router context (this mounts globally).
const go = (hash: string) => {
  window.location.hash = hash;
};
const act = (fn: () => Promise<{ error?: string }>, ok: string) => () => {
  fn().then((r) => notify(r, ok));
};

const COMMANDS: Cmd[] = [
  { id: "fetch", group: "Git", label: "Fetch all", run: act(gitFetch, "Fetched") },
  { id: "pull", group: "Git", label: "Pull", run: act(() => gitPull(), "Pulled") },
  { id: "push", group: "Git", label: "Push", run: act(gitPush, "Pushed") },
  { id: "fetchTags", group: "Git", label: "Fetch tags", run: act(fetchTags, "Fetched tags") },
  { id: "stash", group: "Git", label: "Stash changes", run: act(() => stashPush(), "Stashed") },
  { id: "home", group: "Go", label: "Repository", run: () => go("#/") },
  { id: "reflog", group: "Go", label: "Reflog", run: () => go("#/reflog") },
  { id: "github", group: "Go", label: "Pull requests", run: () => go("#/github") },
  { id: "light", group: "Theme", label: "Light theme", run: () => setTheme("light") },
  { id: "dark", group: "Theme", label: "Dark theme", run: () => setTheme("dark") },
  { id: "system", group: "Theme", label: "System theme", run: () => setTheme("system") },
];

const GROUPS = [...new Set(COMMANDS.map((c) => c.group))];

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (cmd: Cmd) => {
    setOpen(false);
    cmd.run();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        {GROUPS.map((group) => (
          <CommandGroup key={group} heading={group}>
            {COMMANDS.filter((c) => c.group === group).map((c) => (
              <CommandItem
                key={c.id}
                // cmdk filters on this value; include the group so "git" matches.
                value={`${c.group} ${c.label}`}
                onSelect={() => choose(c)}
              >
                {c.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
