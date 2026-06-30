import { RiArrowLeftLine, RiFileTextLine } from "@remixicon/react";
import { type LoaderFunctionArgs, useLoaderData } from "react-router-dom";
import type { Commit } from "@shared/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "@/lib/link";

export async function fileHistoryLoader({ request }: LoaderFunctionArgs) {
  const file = new URL(request.url).searchParams.get("file");
  if (!file)
    return { file: null, commits: [] as Commit[], error: "No file specified." };
  const r = await window.api.fileHistory(file);
  if ("error" in r) return { file, commits: [] as Commit[], error: r.error };
  return { file, commits: r.commits, error: null as string | null };
}

export function FileHistory() {
  const { file, commits, error } = useLoaderData() as Awaited<
    ReturnType<typeof fileHistoryLoader>
  >;
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <RiArrowLeftLine />
            Back to repository
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <RiFileTextLine className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{file}</span>
          <span className="shrink-0 text-muted-foreground">history</span>
        </div>
      </header>

      {error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : commits.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No history for this file.
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {commits.map((c) => (
            <Link
              key={c.sha}
              href={`/diff?sha=${c.sha}&file=${encodeURIComponent(file ?? "")}`}
              className="flex items-center gap-3 border-b border-border/50 px-4 py-2 text-xs hover:bg-accent"
            >
              <span className="w-16 shrink-0 truncate font-mono text-primary">
                {c.shortSha}
              </span>
              <span className="truncate">{c.subject}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {c.authorName}
              </span>
              <span className="w-32 shrink-0 truncate text-right text-muted-foreground">
                {new Date(c.date * 1000).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </ScrollArea>
      )}
    </div>
  );
}
