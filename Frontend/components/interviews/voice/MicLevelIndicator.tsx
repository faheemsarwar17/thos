"use client";

import { useEffect, useRef, useState } from "react";
import { RiMicLine, RiMicOffLine } from "react-icons/ri";

interface MicLevelIndicatorProps {
  micSourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  isMuted: boolean;
}

export default function MicLevelIndicator({ micSourceRef, audioContextRef, isMuted }: MicLevelIndicatorProps) {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const updateLevel = () => {
      // Connect analyser once the source is available
      if (micSourceRef.current && audioContextRef.current && !analyserRef.current) {
        try {
          const analyser = audioContextRef.current.createAnalyser();
          analyser.fftSize = 128; // Small size for simple level meter
          analyser.smoothingTimeConstant = 0.5;
          micSourceRef.current.connect(analyser);
          analyserRef.current = analyser;
        } catch (e) {
          console.warn("Could not connect analyser to mic source:", e);
        }
      }

      if (analyserRef.current && !isMuted) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Boost visually so normal speech shows up well, cap at 100
        setLevel(Math.min(100, Math.round((average / 128) * 100)));
      } else {
        setLevel(0);
      }
      
      animationRef.current = requestAnimationFrame(updateLevel);
    };

    animationRef.current = requestAnimationFrame(updateLevel);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          // ignore disconnect errors on unmount
        }
        analyserRef.current = null;
      }
    };
  }, [micSourceRef, audioContextRef, isMuted]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        backgroundColor: isMuted ? "rgba(239, 68, 68, 0.1)" : "rgba(15, 23, 42, 0.4)",
        border: `1px solid ${isMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.1)"}`,
        borderRadius: "20px",
        transition: "all 0.2s ease",
        margin: "0 auto",
        width: "fit-content",
      }}
      title={isMuted ? "Microphone is muted" : "Microphone active"}
    >
      {isMuted ? (
        <RiMicOffLine size={16} color="#ef4444" />
      ) : (
        <RiMicLine size={16} color="var(--color-text-muted)" />
      )}
      
      <div style={{ display: "flex", gap: "3px", alignItems: "center", height: "12px" }}>
        {[0, 1, 2, 3, 4].map((i) => {
          // Calculate if this bar should be active based on current level (0-100)
          // Thresholds: 10, 30, 50, 70, 90
          const threshold = i * 20 + 10;
          const isActive = !isMuted && level >= threshold;
          
          return (
            <div
              key={i}
              style={{
                width: "4px",
                height: isActive ? "100%" : "30%",
                backgroundColor: isMuted 
                  ? "rgba(239, 68, 68, 0.3)" 
                  : isActive 
                    ? "var(--color-accent)" 
                    : "rgba(255, 255, 255, 0.2)",
                borderRadius: "2px",
                transition: "height 0.1s ease, background-color 0.1s ease",
              }}
            />
          );
        })}
      </div>
      <span style={{ fontSize: "0.75rem", color: isMuted ? "#ef4444" : "var(--color-text-muted)", marginLeft: "4px", fontWeight: 500 }}>
        {isMuted ? "Muted" : "Mic"}
      </span>
    </div>
  );
}
