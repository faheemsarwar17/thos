"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { cn } from "@/lib/cn";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "min(600px, 100vw)",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  className?: string;
}) {
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    // Focus the drawer on open
    drawerRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={cn("drawer", className)}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer__header">
          <div>
            <h2>{title}</h2>
            {subtitle && (
              <p className="eyebrow" style={{ marginTop: "4px" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            className="icon-button focus-ring"
            aria-label="Close drawer"
            onClick={onClose}
          >
            <LuX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="drawer__body">
          {children}
        </div>

        {footer && <div className="drawer__footer">{footer}</div>}
      </div>
    </div>
  );
}
