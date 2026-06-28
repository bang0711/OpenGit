"use client";

import {
  RiArrowLeftLine,
  RiChat3Line,
  RiCheckLine,
  RiCloseLine,
  RiFileList2Line,
  RiGitMergeLine,
  RiLoader4Line,
  RiShieldCheckLine,
} from "@remixicon/react";
import type {
  MergeMethod,
  PrComment,
  PrReview,
  PullRequestDetail,
  ReviewEvent,
} from "@shared/types";
import { useEffect, useState } from "react";
import { DiffStat } from "@/components/shared/diff-stat";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { checkColor, StateBadge } from "./status";

export function PrDetail({
  number,
  onBack,
  onChanged,
}: {
  number: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<MergeMethod>("merge");
  const [comment, setComment] = useState("");

  const load = async () => {
    const r = await window.github.getPR(number);
    if ("error" in r) setError(r.error);
    else {
      setPr(r);
      setError(undefined);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number]);

  const run = async (
    fn: () => Promise<{ error?: string }>,
    success: string,
    after: "reload" | "back",
  ) => {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    notify(res, success);
    if (res?.error) return;
    onChanged();
    if (after === "back") onBack();
    else {
      setComment("");
      load();
    }
  };

  if (error)
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <RiArrowLeftLine /> Back
        </Button>
        <p className="text-destructive mt-3 text-xs">{error}</p>
      </div>
    );

  if (!pr)
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        <RiLoader4Line className="size-5 animate-spin" />
      </div>
    );

  const closed = pr.state === "closed" || pr.merged;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* sticky title */}
      <div className="border-border bg-card flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <RiArrowLeftLine />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {pr.title}{" "}
            <span className="text-muted-foreground font-normal">
              #{pr.number}
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 truncate text-[0.7rem]">
            <span className="font-mono">{pr.head}</span> →{" "}
            <span className="font-mono">{pr.base}</span> · updated{" "}
            {timeAgo(pr.updatedAt)}
          </p>
        </div>
        <StateBadge pr={pr} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4 text-xs">
          {/* author / body */}
          <div className="border-border rounded-lg border">
            <div className="border-border text-muted-foreground flex items-center gap-2 border-b px-3 py-2 text-[0.7rem]">
              <Avatar url={pr.author?.avatarUrl} />
              <span className="text-foreground font-medium">
                {pr.author?.login ?? "unknown"}
              </span>
              opened {timeAgo(pr.createdAt)}
            </div>
            <p className="text-foreground/90 whitespace-pre-wrap p-3 leading-relaxed">
              {pr.body || (
                <span className="text-muted-foreground italic">
                  No description provided.
                </span>
              )}
            </p>
          </div>

          {pr.checks.length > 0 ? (
            <Section icon={<RiShieldCheckLine />} title={`Checks (${pr.checks.length})`}>
              <ul className="divide-border divide-y">
                {pr.checks.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={cn("text-sm leading-none", checkColor(c.conclusion))}>
                      ●
                    </span>
                    <span className="truncate">{c.name}</span>
                    <span className="text-muted-foreground ml-auto text-[0.7rem]">
                      {c.conclusion ?? c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section icon={<RiFileList2Line />} title={`Files (${pr.files.length})`}>
            <ul className="divide-border divide-y">
              {pr.files.map((f) => (
                <li key={f.path} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="truncate font-mono">{f.path}</span>
                  <span className="ml-auto shrink-0">
                    <DiffStat adds={f.additions} dels={f.deletions} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {pr.reviews.length > 0 ? (
            <Section icon={<RiCheckLine />} title={`Reviews (${pr.reviews.length})`}>
              <ul className="divide-border divide-y">
                {pr.reviews.map((r) => (
                  <ReviewRow key={r.id} review={r} />
                ))}
              </ul>
            </Section>
          ) : null}

          <Section
            icon={<RiChat3Line />}
            title={`Comments (${pr.comments_list.length})`}
          >
            {pr.comments_list.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2">No comments yet.</p>
            ) : (
              <ul className="divide-border divide-y">
                {pr.comments_list.map((c) => (
                  <CommentRow key={c.id} comment={c} />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* sticky action bar */}
      {!closed ? (
        <div className="border-border bg-card border-t px-4 py-3">
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
                onClick={() =>
                  run(
                    () => window.github.commentPR(number, comment),
                    "Comment posted",
                    "reload",
                  )
                }
              >
                <RiChat3Line /> Comment
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => window.github.reviewPR(number, "APPROVE", comment),
                    "Approved",
                    "reload",
                  )
                }
              >
                <RiCheckLine /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !comment.trim()}
                onClick={() =>
                  run(
                    () =>
                      window.github.reviewPR(
                        number,
                        "REQUEST_CHANGES" as ReviewEvent,
                        comment,
                      ),
                    "Changes requested",
                    "reload",
                  )
                }
              >
                Request changes
              </Button>

              <div className="ml-auto flex items-center gap-1.5">
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as MergeMethod)}
                >
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
                  onClick={() =>
                    run(
                      () => window.github.mergePR(number, method),
                      "Pull request merged",
                      "back",
                    )
                  }
                >
                  <RiGitMergeLine /> Merge
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => window.github.closePR(number),
                      "Pull request closed",
                      "back",
                    )
                  }
                >
                  <RiCloseLine /> Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border overflow-hidden rounded-lg border">
      <h3 className="border-border bg-muted/30 flex items-center gap-2 border-b px-3 py-2 font-medium [&_svg]:size-3.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function ReviewRow({ review }: { review: PrReview }) {
  return (
    <li className="text-muted-foreground flex items-center gap-2 px-3 py-1.5">
      <Avatar url={review.author?.avatarUrl} />
      <span className="text-foreground font-medium">{review.author?.login}</span>
      {review.state.toLowerCase().replace(/_/g, " ")}
      {review.submittedAt ? (
        <span className="ml-auto text-[0.7rem]">{timeAgo(review.submittedAt)}</span>
      ) : null}
    </li>
  );
}

function CommentRow({ comment }: { comment: PrComment }) {
  return (
    <li className="px-3 py-2">
      <div className="text-muted-foreground mb-1 flex items-center gap-2 text-[0.7rem]">
        <Avatar url={comment.author?.avatarUrl} />
        <span className="text-foreground font-medium">
          {comment.author?.login}
        </span>
        {timeAgo(comment.createdAt)}
      </div>
      <p className="whitespace-pre-wrap pl-7 leading-relaxed">{comment.body}</p>
    </li>
  );
}

function Avatar({ url }: { url?: string }) {
  if (!url) return <div className="bg-muted size-5 shrink-0 rounded-full" />;
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="ring-border size-5 shrink-0 rounded-full ring-1"
    />
  );
}
