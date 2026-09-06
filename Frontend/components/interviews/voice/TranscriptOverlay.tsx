import { useEffect, useRef } from "react";

export type TranscriptEntry = {
  speaker: "agent" | "user";
  text: string;
  timestamp?: string;
};

interface TranscriptOverlayProps {
  transcript: TranscriptEntry[];
  statusMessage?: string;
  agentLabel?: string;
  style?: React.CSSProperties;
}

export default function TranscriptOverlay({ transcript, statusMessage, agentLabel, style }: TranscriptOverlayProps) {
  const displayAgentLabel = agentLabel?.trim() || "Interviewer";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div 
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "24px",
        ...style
      }}
    >
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Live Transcript
      </h3>
      
      <div 
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          paddingRight: "12px"
        }}
        className="custom-scrollbar"
      >
        {transcript.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9375rem", fontStyle: "italic", marginBottom: "12px" }}>
              {statusMessage || "Establishing secure connection with your interviewer..."}
            </p>
            <span className="spinner spinner-accent" style={{ width: "20px", height: "20px" }} />
          </div>
        ) : (
          transcript.map((entry, idx) => (
            <div 
              key={idx} 
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: entry.speaker === "agent" ? "flex-start" : "flex-end"
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "4px", marginLeft: "4px", marginRight: "4px" }}>
                {entry.speaker === "agent" ? displayAgentLabel : "You"}
              </span>
              <div 
                style={{
                  backgroundColor: entry.speaker === "agent" ? "var(--color-surface-hover)" : "var(--color-accent-light)",
                  color: entry.speaker === "agent" ? "var(--color-text)" : "var(--color-accent)",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontSize: "0.9375rem",
                  maxWidth: "85%",
                  border: entry.speaker === "agent" ? "1px solid var(--color-border)" : "1px solid transparent",
                }}
              >
                {entry.text}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
