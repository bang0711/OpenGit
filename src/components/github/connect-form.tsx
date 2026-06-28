"use client";

import { RiArrowLeftLine, RiGithubFill } from "@remixicon/react";
import { GithubSignIn } from "@/components/github-signin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "@/lib/link";

export function ConnectForm({
  reason,
  onConnected,
}: {
  reason?: string;
  onConnected: () => void;
}) {
  return (
    <div className="relative flex h-full items-center justify-center p-6">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="absolute top-3 left-3"
      >
        <Link href="/">
          <RiArrowLeftLine /> Back
        </Link>
      </Button>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <RiGithubFill className="size-5" />
            <CardTitle className="text-base">Connect to GitHub</CardTitle>
          </div>
          <CardDescription>
            Sign in to manage pull requests, issues, and collaborators. Your
            credentials are stored encrypted on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reason ? (
            <p className="text-destructive mb-3 text-xs">{reason}</p>
          ) : null}
          <GithubSignIn onConnected={onConnected} />
        </CardContent>
      </Card>
    </div>
  );
}
