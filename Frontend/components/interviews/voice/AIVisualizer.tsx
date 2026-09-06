interface AIVisualizerProps {
  isAgentSpeaking: boolean;
  participantCount?: number;
  interviewerName?: string;
}

export default function AIVisualizer({ isAgentSpeaking, participantCount = 1, interviewerName }: AIVisualizerProps) {
  const displayName = interviewerName?.trim() || "Interviewer";
  const statusLabel = isAgentSpeaking ? `${displayName} speaking` : `${displayName} listening`;
  const connectionLabel = participantCount > 1 ? "Session live" : "Connecting interviewer...";

  // If interviewer is speaking, pulse. If idle, just show connected state.
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", margin: "16px 0" }}>
      
      <div 
        style={{
          width: "104px",
          height: "104px",
          borderRadius: "50%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isAgentSpeaking ? "var(--color-accent)" : "var(--color-surface)",
          border: `2px solid ${isAgentSpeaking ? "transparent" : "var(--color-border)"}`,
          transition: "all 0.3s ease",
          boxShadow: isAgentSpeaking ? "0 0 40px rgba(59, 130, 246, 0.4)" : "none",
        }}
      >
        {/* Pulse rings when speaking */}
        {isAgentSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: "var(--color-accent)", opacity: 0.2 }} />
            <div className="absolute inset-[-20px] rounded-full animate-pulse" style={{ backgroundColor: "var(--color-accent)", opacity: 0.1 }} />
          </>
        )}
        
        <svg fill="none" viewBox="0 0 24 24" width="48" height="48" stroke={isAgentSpeaking ? "white" : "var(--color-text-muted)"} strokeWidth={1.5}>
          {isAgentSpeaking ? (
             <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          ) : (
             <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          )}
        </svg>
      </div>

      <div style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 4px" }}>
          {statusLabel}
        </h3>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", margin: 0 }}>
          {connectionLabel}
        </p>
      </div>
    </div>
  );
}
