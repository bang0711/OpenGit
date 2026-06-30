"use client";

import { RiFolderOpenLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { worktreeAdd } from "@/app/actions";
import { FolderPicker } from "@/components/folder-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";

export function WorktreeAddDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [parent, setParent] = useState("");
  const [folder, setFolder] = useState("");
  const [branch, setBranch] = useState("");
  const [newBranch, setNewBranch] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setParent("");
      setFolder("");
      setBranch("");
      setNewBranch(false);
    }
  }, [open]);

  const sep = parent.includes("\\") ? "\\" : "/";
  const fullPath =
    parent && folder ? `${parent.replace(/[/\\]$/, "")}${sep}${folder}` : "";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !fullPath) return;
    setPending(true);
    worktreeAdd(fullPath, branch.trim() || undefined, newBranch)
      .then((r) => {
        notify(r, "Worktree added");
        if (!("error" in r)) {
          onChanged();
          onOpenChange(false);
        }
      })
      .finally(() => setPending(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add worktree</DialogTitle>
          <DialogDescription>
            Check out a branch into a new folder, linked to this repo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Parent folder</Label>
            <div className="flex gap-2">
              <Input
                value={parent}
                readOnly
                placeholder="Choose where to create it…"
                className="font-mono text-xs"
              />
              <FolderPicker
                mode="dir"
                title="Parent folder"
                description="Pick the folder the worktree folder will be created inside."
                onPick={setParent}
              >
                <Button type="button" variant="outline">
                  <RiFolderOpenLine /> Browse
                </Button>
              </FolderPicker>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wt-folder">New folder name</Label>
            <Input
              id="wt-folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="my-worktree"
            />
            {fullPath ? (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {fullPath}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wt-branch">Branch (optional)</Label>
            <Input
              id="wt-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/x"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="wt-new"
              checked={newBranch}
              onCheckedChange={(v) => setNewBranch(v === true)}
            />
            <Label htmlFor="wt-new" className="font-normal text-muted-foreground">
              Create the branch (must not exist)
            </Label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !fullPath}>
              Add worktree
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
