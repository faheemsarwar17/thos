import { LuShieldCheck } from "react-icons/lu";
import { cn } from "@/lib/cn";

export function PackChip({
  name,
  className,
  tooltip,
}: {
  name: string;
  className?: string;
  tooltip?: string;
}) {
  return (
    <div
      className={cn("pack-chip", className)}
      role="status"
      aria-label={`Active domain pack: ${name}`}
      title={tooltip ?? `Domain Pack: ${name} · Standardized hiring ontology & evaluation engine`}
    >
      <span className="pack-chip__mark" aria-hidden="true">
        <LuShieldCheck size={12} strokeWidth={2.5} />
      </span>
      <span>{name}</span>
    </div>
  );
}
