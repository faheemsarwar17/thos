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
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-interview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__head">
          <span className="fx-icon fx-icon--warn fx-icon--sm" aria-hidden="true">
            <RiAlertLine size={20} />
          </span>
          <div className="dialog__titles">
            <h2 id="end-interview-title">End Interview?</h2>
            <p className="dialog__desc">
              This will stop the session and upload your recording. The transcript will be analyzed
              automatically. <strong>This cannot be undone.</strong>
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Cancel" title="Cancel">
            <RiCloseLine size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel} className="button button--secondary">
            Continue Interview
          </button>
          <button type="button" onClick={onConfirm} className="button button--danger-filled">
            End Interview
          </button>
        </div>
      </div>
    </div>
  );
}
