"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

export function Popover({ trigger, children, align = "right", label, className }: {
  trigger: (p: { open: boolean; toggle: () => void; ref: RefObject<HTMLButtonElement | null> }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right"; label: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return (
    <div className="popover-anchor" ref={wrap}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn })}
      {open && (
        <div className={cn("popover", `popover--${align}`, className)} role="dialog" aria-label={label}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
