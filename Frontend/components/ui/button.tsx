import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-filled";

export type ButtonSize = "sm" | "small" | "default" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  iconLeft,
  iconRight,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const normalizedSize = size === "small" ? "sm" : size;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      className={cn(
        "button",
        `button--${variant}`,
        normalizedSize !== "default" && `button--${normalizedSize}`,
        "focus-ring",
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="button__spinner" aria-hidden="true" />
      ) : (
        iconLeft && <span className="button__icon" aria-hidden="true">{iconLeft}</span>
      )}
      <span>{children}</span>
      {!loading && iconRight && (
        <span className="button__icon" aria-hidden="true">{iconRight}</span>
      )}
    </button>
  );
}
