export function Avatar({ url }: { url?: string }) {
  if (!url) return <div className="bg-muted size-5 shrink-0 rounded-full" />;
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="ring-border size-5 shrink-0 rounded-full ring-1"
    />
  );
}
