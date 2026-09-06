"use client";

import React from "react";

type StepIndicatorProps = {
  current: number;
  steps: string[];
};

export default function StepIndicator({ current, steps }: StepIndicatorProps) {
  const gray300 = "rgba(148, 163, 184, 0.55)";
  const green400 = "rgba(34, 197, 94, 0.85)";
  const blue500 = "rgba(37, 99, 235, 0.95)";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        {steps.map((step, i) => {
          const isActive = i === current;
          const isCompleted = i < current;

          const lineColor = isCompleted ? green400 : isActive ? blue500 : gray300;
          const circleBorderColor = isActive ? blue500 : isCompleted ? green400 : gray300;
          const circleBgColor = isCompleted ? green400 : "#ffffff";
          const circleTextColor = isActive ? blue500 : isCompleted ? "#ffffff" : "rgba(100,116,139,0.75)";
          const labelColor = isActive ? blue500 : isCompleted ? green400 : "rgba(100,116,139,0.7)";

          return (
            <div key={`${step}-${i}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", padding: "0 8px" }}>
              {/* Row with line + circle + line */}
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <div style={{ flex: 1, height: "6px", borderRadius: "999px 0 0 999px", backgroundColor: lineColor, transition: "all 300ms" }} />

                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "999px",
                    border: `2px solid ${circleBorderColor}`,
                    backgroundColor: circleBgColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: circleTextColor,
                    transition: "all 300ms",
                    boxShadow: isCompleted ? "0 4px 10px rgba(34, 197, 94, 0.18)" : undefined,
                    transform: isActive ? "scale(1.10)" : undefined,
                    outline: isActive ? "6px solid rgba(37, 99, 235, 0.12)" : undefined,
                  }}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>

                <div style={{ flex: 1, height: "6px", borderRadius: "0 999px 999px 0", backgroundColor: lineColor, transition: "all 300ms" }} />
              </div>

              <span style={{ marginTop: "12px", fontSize: "0.75rem", fontWeight: 700, textAlign: "center", color: labelColor, transition: "all 300ms" }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

