"use client";

import {
  RiChat3Line,
  RiCheckLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import type { PrComment, PrReview, PullRequestDetail } from "@shared/types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { checkColor } from "../status";
import { Avatar } from "./avatar";

export function Conversation({ pr }: { pr: PullRequestDetail }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-xs">
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

      {pr.reviews.length > 0 ? (
        <Section icon={<RiCheckLine />} title={`Reviews (${pr.reviews.length})`}>
          <ul className="divide-border divide-y">
            {pr.reviews.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
        </Section>
      ) : null}

      <Section icon={<RiChat3Line />} title={`Comments (${pr.comments_list.length})`}>
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
