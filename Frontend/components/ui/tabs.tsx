"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string = string> = { id: T; label: string; count?: number; icon?: ReactNode };

export function Tabs<T extends string = string>({ tabs, activeTab, onChange, className }: {
  tabs: TabItem<T>[]; activeTab: T; onChange: (tabId: T) => void; className?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    const list = e.currentTarget.parentElement;
    (list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
  };
  return (
    <div className={cn("tabs-nav", className)} role="tablist">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <button key={tab.id} type="button" role="tab" aria-selected={isActive} tabIndex={isActive ? 0 : -1}
            className={cn("tabs-nav__item", isActive && "tabs-nav__item--active")}
            onClick={() => onChange(tab.id)} onKeyDown={(e) => onKey(e, i)}>
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="tabs-nav__count tabular-nums">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
