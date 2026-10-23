"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { LuCircleCheck, LuCircleAlert, LuInfo, LuTriangleAlert, LuX } from "react-icons/lu";
import { cn } from "@/lib/cn";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastMessage = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
};

type ToastContextValue = {
  toast: (options: { type?: ToastType; title?: string; message: string; durationMs?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({
      type = "info",
      title,
      message,
      durationMs = 4000,
    }: {
      type?: ToastType;
      title?: string;
      message: string;
      durationMs?: number;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string, title?: string) => toast({ type: "success", title, message }), [toast]);
  const error = useCallback((message: string, title?: string) => toast({ type: "error", title, message }), [toast]);
  const info = useCallback((message: string, title?: string) => toast({ type: "info", title, message }), [toast]);
  const warning = useCallback((message: string, title?: string) => toast({ type: "warning", title, message }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      <div
        className="toast-container"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn("toast", `toast--${t.type}`)}
            role="status"
          >
            <div className="toast__main">
              <span className="toast__icon">
                {t.type === "success" && <LuCircleCheck aria-hidden="true" />}
                {t.type === "error" && <LuCircleAlert aria-hidden="true" />}
                {t.type === "info" && <LuInfo aria-hidden="true" />}
                {t.type === "warning" && <LuTriangleAlert aria-hidden="true" />}
              </span>
              <div className="toast__text">
                {t.title && <strong>{t.title}</strong>}
                <p>{t.message}</p>
              </div>
            </div>
            <button
              type="button"
              className="icon-button toast__close"
              aria-label="Dismiss notification"
              onClick={() => removeToast(t.id)}
            >
              <LuX size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if not wrapped in provider
    return {
      toast: console.log,
      success: console.log,
      error: console.error,
      info: console.log,
      warning: console.warn,
    };
  }
  return ctx;
}
