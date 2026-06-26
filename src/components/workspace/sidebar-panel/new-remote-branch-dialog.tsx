"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModeRadio } from "./mode-radio";

export function NewRemoteBranchDialog({
  open,
  onOpenChange,
  remotes,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remotes: string[];
  onSubmit: (name: string, remote: string, mode: "remote" | "both") => void;
}) {
  const [name, setName] = useState("");
  const [remote, setRemote] = useState(remotes[0] ?? "");
  const [mode, setMode] = useState<"remote" | "both">("both");

  useEffect(() => {
    if (open) {
      setName("");
      setRemote(remotes[0] ?? "");
      setMode("both");
    }
  }, [open, remotes]);

  const submit = () => {
    const v = name.trim();
    if (!v || !remote) return;
    onOpenChange(false);
    onSubmit(v, remote, mode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New remote branch</DialogTitle>
          <DialogDescription>
            Creates a branch from the current HEAD on the remote.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Branch name</span>
            <Input
              autoFocus
              value={name}
              placeholder="feature/my-branch"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {remotes.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">Remote</span>
              <select
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                {remotes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium">Create</legend>
            <ModeRadio
              checked={mode === "both"}
              onSelect={() => setMode("both")}
              label="Remote + local"
              hint="Branch locally, switch to it, and push with tracking"
            />
            <ModeRadio
              checked={mode === "remote"}
              onSelect={() => setMode("remote")}
              label="Remote only"
              hint="Push a new branch to the remote; stay on the current branch"
            />
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !remote}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
