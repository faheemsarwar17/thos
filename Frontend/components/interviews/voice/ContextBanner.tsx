"use client";

import { useEffect, useState } from "react";
import { InterviewType } from "@/types/tracking";

interface ContextBannerProps {
  interviewType: InterviewType;
  subjectName: string;
}

const TYPE_LABELS: Record<string, string> = {
	SELF: "Self-Evaluation",
	TEAMLEAD: "Team Lead Review",
	MANAGER: "Manager Review",
	PEER: "Peer Review",
	HR: "HR Review",
	profile_screening: "Profile Screening",
	job_interview: "Job Interview",
};

const TYPE_COLORS: Record<string, string> = {
	SELF: "var(--color-blue)",
	TEAMLEAD: "var(--color-accent)",
	MANAGER: "var(--color-accent)",
	PEER: "var(--color-success)",
	HR: "var(--color-warning)",
	profile_screening: "var(--color-blue)",
	job_interview: "var(--color-accent)",
};

export default function ContextBanner({ interviewType, subjectName }: ContextBannerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#fff",
            backgroundColor: TYPE_COLORS[interviewType] || "var(--color-text-muted)",
            padding: "4px 8px",
            borderRadius: "4px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {TYPE_LABELS[interviewType] || interviewType}
        </span>
        <span style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-text-body)" }}>
          Reviewing: <strong style={{ color: "var(--color-text-heading)" }}>{subjectName}</strong>
        </span>
      </div>

      <div
        style={{
          fontFamily: "monospace",
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--color-text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-error)", animation: "pulse 2s infinite" }} />
        {formatTime(elapsed)}
      </div>
    </div>
  );
}
