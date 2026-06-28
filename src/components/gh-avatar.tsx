import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** GitHub user avatar (shadcn Avatar with ring + initials fallback). */
export function GhAvatar({
  url,
  login,
  className,
}: {
  url?: string;
  login?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("ring-border size-5 ring-1", className)}>
      {url ? (
        <AvatarImage src={url} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback>{(login ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
