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
      <p className="state-block__title">{label}</p>
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
      <LuCircleAlert size={26} className="state-block__icon" aria-hidden="true" />
      <div>
        <h4 className="state-block__title">{title}</h4>
        <p className="state-block__desc">{message}</p>
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
      <div className="state-block__badge" aria-hidden="true">
        {icon ?? <LuLayers size={22} />}
      </div>
      <div>
        <h4 className="state-block__title">{title}</h4>
        {description && <p className="state-block__desc">{description}</p>}
      </div>
      {action && <div className="state-block__action">{action}</div>}
    </div>
  );
}
