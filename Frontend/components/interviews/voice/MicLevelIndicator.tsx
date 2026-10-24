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
    <div className={isMuted ? "fx-mic is-muted" : "fx-mic"} title={isMuted ? "Microphone is muted" : "Microphone active"}>
      {isMuted ? <RiMicOffLine size={16} aria-hidden /> : <RiMicLine size={16} aria-hidden />}

      <div className="fx-mic__bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => {
          // Calculate if this bar should be active based on current level (0-100)
          // Thresholds: 10, 30, 50, 70, 90
          const threshold = i * 20 + 10;
          const isActive = !isMuted && level >= threshold;

          return <span key={i} className={isActive ? "is-active" : undefined} />;
        })}
      </div>
      <span className="fx-mic__label">{isMuted ? "Muted" : "Mic"}</span>
    </div>
  );
}
