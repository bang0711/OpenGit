"use client";

import { RiChat3Line, RiCheckLine, RiCloseLine, RiGitMergeLine } from "@remixicon/react";
import type { MergeMethod, ReviewEvent } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Run = (
  fn: () => Promise<{ error?: string }>,
  success: string,
  after: "reload" | "back",
) => void;

export function ActionBar({
  number,
  busy,
  comment,
  setComment,
  method,
  setMethod,
  run,
}: {
  number: number;
  busy: boolean;
  comment: string;
  setComment: (v: string) => void;
  method: MergeMethod;
  setMethod: (m: MergeMethod) => void;
  run: Run;
}) {
  const gh = window.github;
  return (
    <div className="border-border bg-card shrink-0 border-t px-4 py-3">
      <div className="mx-auto max-w-3xl space-y-2">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Leave a comment or review…"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !comment.trim()}
            onClick={() => run(() => gh.commentPR(number, comment), "Comment posted", "reload")}
          >
            <RiChat3Line /> Comment
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => gh.reviewPR(number, "APPROVE", comment), "Approved", "reload")}
          >
            <RiCheckLine /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !comment.trim()}
            onClick={() =>
              run(
                () => gh.reviewPR(number, "REQUEST_CHANGES" as ReviewEvent, comment),
                "Changes requested",
                "reload",
              )
            }
          >
            Request changes
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <Select value={method} onValueChange={(v) => setMethod(v as MergeMethod)}>
              <SelectTrigger className="h-8 w-[7rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merge">Merge</SelectItem>
                <SelectItem value="squash">Squash</SelectItem>
                <SelectItem value="rebase">Rebase</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => gh.mergePR(number, method), "Pull request merged", "back")}
            >
              <RiGitMergeLine /> Merge
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => run(() => gh.closePR(number), "Pull request closed", "back")}
            >
              <RiCloseLine /> Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
