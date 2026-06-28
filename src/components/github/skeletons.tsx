import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder rows for the PR list while the first fetch is in flight. */
export function PrListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-1">
        {[14, 16, 10].map((w) => (
          <Skeleton key={w} className="h-6 rounded-full" style={{ width: w * 4 }} />
        ))}
      </div>
      <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            key={i}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for the PR detail pane while a PR loads. */
export function PrDetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border bg-card shrink-0 space-y-2 border-b px-4 py-3">
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <div className="border-border space-y-2 rounded-lg border p-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}
