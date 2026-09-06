import { cn } from "@/lib/cn";

export type ScoreTier = "gold" | "silver" | "bronze" | "weak" | "none";

export function getScoreTier(score: number | null | undefined): {
  tier: ScoreTier;
  label: string;
} {
  if (score === null || score === undefined) {
    return { tier: "none", label: "No score" };
  }
  if (score >= 85) {
    return { tier: "gold", label: "Gold Tier" };
  }
  if (score >= 70) {
    return { tier: "silver", label: "Silver Tier" };
  }
  if (score >= 50) {
    return { tier: "bronze", label: "Bronze Tier" };
  }
  return { tier: "weak", label: "Under Threshold" };
}

export function ScoreBadge({
  score,
  label,
  className,
}: {
  score: number | null | undefined;
  label?: string;
  className?: string;
}) {
  if (score === null || score === undefined) {
    return (
      <span
        className={cn("score-badge score-badge--none tabular-nums", className)}
        role="status"
        aria-label="No score evaluated yet"
      >
        <span aria-hidden="true">—</span>
        <span>{label ?? "Unscored"}</span>
      </span>
    );
  }

  const { tier, label: tierLabel } = getScoreTier(score);
  const rounded = Math.round(score);
  const displayLabel = label ?? tierLabel;

  return (
    <span
      className={cn("score-badge", `score-badge--${tier}`, "tabular-nums", className)}
      role="status"
      aria-label={`Score: ${rounded} out of 100, ${displayLabel}`}
      title={`Skill evaluation: ${rounded}/100 (${displayLabel})`}
    >
      <strong>{rounded}</strong>
      <span>{displayLabel}</span>
    </span>
  );
}
