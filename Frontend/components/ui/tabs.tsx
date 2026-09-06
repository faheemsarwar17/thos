"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string = string> = {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
};

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("tabs-nav", className)} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              "tabs-nav__item",
              isActive && "tabs-nav__item--active"
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  background: isActive ? "var(--brand-100)" : "var(--surface-sunken)",
                  color: isActive ? "var(--brand-700)" : "var(--ink-600)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
