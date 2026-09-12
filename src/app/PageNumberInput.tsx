import { useEffect, useState } from "react";
import { NumberField } from "@base-ui/react/number-field";

export function PageNumberInput({
  label = "Page number",
  page,
  count,
  onNavigate,
}: {
  label?: string;
  page: number;
  count: number;
  onNavigate: (page: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(page);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(page);
  }, [page, editing]);
  function commit(value: number | null) {
    const next = Math.max(1, Math.min(Math.round(value ?? page), count || 1));
    setDraft(next);
    onNavigate(next);
  }
  return (
    <NumberField.Root
      className="page-input"
      value={draft}
      min={1}
      max={count || 1}
      step={1}
      smallStep={1}
      format={{ maximumFractionDigits: 0, useGrouping: false }}
      onValueChange={setDraft}
      onValueCommitted={commit}
      disabled={!count}
    >
      <NumberField.Input
        aria-label={label}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(page);
          }
        }}
      />
      <span aria-hidden="true">/ {count || "—"}</span>
    </NumberField.Root>
  );
}
