import { GhAvatar } from "@/components/gh-avatar";

export function Avatar({ url }: { url?: string }) {
  return <GhAvatar url={url} />;
}
