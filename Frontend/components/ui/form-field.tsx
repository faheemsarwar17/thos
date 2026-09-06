import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  id?: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("form-field", className)}>
      <label htmlFor={id} className="form-field__label">
        {label}
        {required && <span style={{ color: "var(--red-600)", marginLeft: "3px" }}>*</span>}
      </label>
      {children}
      {hint && !error && <p className="form-field__hint">{hint}</p>}
      {error && (
        <p id={id ? `${id}-error` : undefined} className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
