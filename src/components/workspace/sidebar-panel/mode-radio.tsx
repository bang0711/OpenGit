export function ModeRadio({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/50">
      <input
        type="radio"
        name="remote-branch-mode"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-3.5 shrink-0 accent-primary"
      />
      <span className="flex flex-col">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[0.625rem] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
