"use client";

import { useEffect, useRef } from "react";
import { RiAlertLine, RiCloseLine } from "react-icons/ri";

interface EndInterviewModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function EndInterviewModal({ onConfirm, onCancel }: EndInterviewModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on open (safe default — harder to accidentally confirm)
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    // Backdrop
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.15s ease",
      }}
    >
      {/* Modal card — stop click from bubbling to backdrop */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          padding: "32px",
          animation: "slideUp 0.2s ease",
        }}
      >
        {/* Icon + heading */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <RiAlertLine size={22} color="#ef4444" />
          </div>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: "1.0625rem", fontWeight: 600 }}>
              End Interview?
            </h3>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
              This will stop the session and upload your recording. The transcript will be analyzed
              automatically. <strong>This cannot be undone.</strong>
            </p>
          </div>
          {/* Close X */}
          <button
            onClick={onCancel}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
            title="Cancel"
          >
            <RiCloseLine size={18} />
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ minWidth: "100px" }}
          >
            Continue Interview
          </button>
          <button
            onClick={onConfirm}
            className="btn btn-danger"
            style={{ minWidth: "100px" }}
          >
            End Interview
          </button>
        </div>
      </div>
    </div>
  );
}
