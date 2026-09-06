import Link from "next/link";
import type { ReactNode } from "react";
import { LuArrowRight } from "react-icons/lu";
import { Pill, type PillTone } from "@/components/ui/pill";
import { cn } from "@/lib/cn";

export function AttentionQueueCard({
  icon,
  count,
  title,
  detail,
  action,
  tone,
  href = "#active-requisitions",
  className,
}: {
  icon: ReactNode;
  count: number;
  title: string;
  detail: string;
  action: string;
  tone: PillTone;
  href?: string;
  className?: string;
}) {
  return (
    <Link className={cn("attention-queue-card", className)} href={href}>
      <div className="attention-queue-card__topline">
        <span className="attention-queue-card__icon" aria-hidden="true">
          {icon}
        </span>
        <Pill tone={tone}>{count} open</Pill>
      </div>
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      <span className="attention-queue-card__action">
        {action}
        <LuArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
