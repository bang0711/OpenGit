import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export function Side({
  title,
  text,
}: {
  title: string;
  text: string | null | undefined;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-7 shrink-0 items-center border-b border-border bg-card px-3 text-xs font-semibold">
        {title}
      </div>
      <ScrollArea className="h-full inset-0 flex-1">
        <pre className="w-max min-w-full px-3 py-1 font-mono text-xs leading-5">
          {text ?? "(file not present on this side)"}
        </pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
