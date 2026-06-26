"use client";

export function Row({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-xs"
    >
      {children}
    </div>
  );
}
