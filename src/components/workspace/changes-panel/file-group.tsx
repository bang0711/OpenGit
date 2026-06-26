import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function FileGroup({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-h-[45%] min-h-9 flex-col border-b border-border">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-semibold text-muted-foreground">
        {title}
        <Badge variant="secondary">{count}</Badge>
        <div className="ml-auto flex items-center gap-1">{action}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {count === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground/60">
            Nothing here.
          </p>
        ) : (
          <div className="pb-1">{children}</div>
        )}
      </ScrollArea>
    </div>
  );
}
