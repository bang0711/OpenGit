"use client";

import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react";
import type { Collaborator, GithubBranch } from "@shared/types";
import { useEffect, useState } from "react";
import { GhAvatar } from "@/components/gh-avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

export function CreatePrDialog({
  open,
  onOpenChange,
  branches,
  collaborators,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: GithubBranch[];
  collaborators: Collaborator[];
  onCreated: () => void;
}) {
  const names = branches.map((b) => b.name);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("");
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setHead("");
      setReviewers([]);
      setBase(names.find((n) => n === "main" || n === "master") ?? names[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleReviewer = (login: string) =>
    setReviewers((prev) =>
      prev.includes(login)
        ? prev.filter((l) => l !== login)
        : [...prev, login],
    );

  const submit = async () => {
    if (busy || !title.trim() || !head || !base) return;
    setBusy(true);
    const res = await window.github.createPR(
      title.trim(),
      body,
      head,
      base,
      reviewers,
    );
    setBusy(false);
    notify(res, "Pull request created");
    if (!res?.error) {
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New pull request</DialogTitle>
          <DialogDescription>
            Open a PR from a head branch into a base branch.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Head (compare)</Label>
              <Select value={head} onValueChange={setHead}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="branch" />
                </SelectTrigger>
                <SelectContent>
                  {names.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Base</Label>
              <Select value={base} onValueChange={setBase}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="branch" />
                </SelectTrigger>
                <SelectContent>
                  {names.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pr-title">Title</Label>
            <Input
              id="pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pr-body">Description</Label>
            <Textarea
              id="pr-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {collaborators.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label>Reviewers</Label>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <span className={reviewers.length ? "" : "text-muted-foreground"}>
                      {reviewers.length
                        ? `${reviewers.length} reviewer${reviewers.length > 1 ? "s" : ""} selected`
                        : "Select reviewers"}
                    </span>
                    <RiArrowDownSLine className="opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-56 w-(--radix-dropdown-menu-trigger-width) overflow-auto"
                >
                  {collaborators.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.login}
                      checked={reviewers.includes(c.login)}
                      onCheckedChange={() => toggleReviewer(c.login)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <GhAvatar
                        url={c.avatarUrl}
                        login={c.login}
                        className="mr-1"
                      />
                      <span className="font-medium">{c.login}</span>
                      <Badge variant="outline" className="ml-auto capitalize">
                        {c.role}
                      </Badge>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {reviewers.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {reviewers.map((login) => (
                    <button
                      key={login}
                      type="button"
                      onClick={() => toggleReviewer(login)}
                      className="bg-muted hover:bg-muted/70 flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-[0.7rem]"
                    >
                      {login}
                      <RiCloseLine className="size-3" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !title.trim() || !head || !base || head === base}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
