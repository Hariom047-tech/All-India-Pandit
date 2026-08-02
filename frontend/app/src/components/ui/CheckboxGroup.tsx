import type { ReactNode } from "react";

export function CheckboxGroup({
  values,
  counts,
  selected,
  onToggle,
}: {
  values: string[];
  counts?: Record<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <>
      {values.map((v) => (
        <label className="check" key={v}>
          <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(v)} />
          <span>{v}</span>
          {counts && counts[v] != null && <span className="check-count">({counts[v]})</span>}
        </label>
      ))}
    </>
  );
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
  render,
}: {
  name: string;
  options: { value: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  render: (value: string) => ReactNode;
}) {
  return (
    <>
      {options.map((o) => (
        <label className="check" key={o.value}>
          <input
            type="radio"
            name={name}
            style={{ borderRadius: "50%" }}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {render(o.value)}
          {o.count != null && <span className="check-count">({o.count})</span>}
        </label>
      ))}
    </>
  );
}
