import { cn } from "@/lib/utils";

// Centered, muted message used for empty/error/placeholder states across panes.
export function Notice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
