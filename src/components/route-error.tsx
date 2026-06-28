import { RiAlertLine, RiArrowLeftLine, RiRefreshLine } from "@remixicon/react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Link from "@/lib/link";

/** Friendly fallback for any route that throws (loader or render error). */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

  return (
    <div className="bg-background flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <RiAlertLine className="text-destructive size-10" />
      <div className="space-y-1">
        <h1 className="text-sm font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md text-xs break-words">
          {message}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => location.reload()}>
          <RiRefreshLine /> Reload
        </Button>
        <Button asChild size="sm">
          <Link href="/">
            <RiArrowLeftLine /> Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
