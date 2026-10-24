"use client";

import React from "react";
import { LuCheck } from "react-icons/lu";

type StepIndicatorProps = {
  current: number;
  steps: string[];
};

/** Compact progress for the focus header; ≤900px only the current label shows (CSS). */
export default function StepIndicator({ current, steps }: StepIndicatorProps) {
  return (
    <ol className="fx-steps" aria-label="Interview progress">
      {steps.map((step, i) => {
        const state = i < current ? "is-done" : i === current ? "is-current" : "";
        return (
          <li key={`${step}-${i}`} className={state} aria-current={i === current ? "step" : undefined}>
            <span aria-hidden="true">{i < current ? <LuCheck size={11} /> : i + 1}</span>
            <em>{step}</em>
          </li>
        );
      })}
    </ol>
  );
}
