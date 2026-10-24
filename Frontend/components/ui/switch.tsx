"use client";
import { useId, type ReactNode } from "react";

export function Switch({ checked, onChange, label, description, disabled, id }: {
  checked: boolean; onChange: (next: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label className="switch-row" htmlFor={inputId}>
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {description && <span className="switch-row__desc">{description}</span>}
      </span>
      <input id={inputId} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled}
        aria-checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
