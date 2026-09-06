import type { ReactNode } from "react";
import { LuCircleAlert, LuLayers, LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden="true" />;
}

export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("state-block", className)} role="status" aria-live="polite">
      <span className="state-block__spinner" aria-hidden="true" />
      <p style={{ fontWeight: 500 }}>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something requires attention",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("state-block state-block--error", className)} role="alert">
      <LuCircleAlert size={28} style={{ color: "var(--red-600)" }} aria-hidden="true" />
      <div>
        <h4 style={{ margin: "0 0 4px", color: "var(--red-700)", fontWeight: 600 }}>{title}</h4>
        <p style={{ color: "var(--red-700)" }}>{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          iconLeft={<LuRefreshCw size={13} />}
        >
          Retry action
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("state-block", className)}>
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "var(--surface-sunken)",
          display: "grid",
          placeItems: "center",
          color: "var(--ink-400)",
        }}
        aria-hidden="true"
      >
        {icon ?? <LuLayers size={22} />}
      </div>
      <div>
        <h4 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600, color: "var(--ink-900)" }}>
          {title}
        </h4>
        {description && (
          <p style={{ margin: 0, color: "var(--ink-600)", fontSize: "13px" }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: "4px" }}>{action}</div>}
    </div>
  );
}
