"use client";

import { useEffect, useRef, useState } from "react";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Countdown to the server-computed deadline; fires onExpire once at zero. */
export function SandboxTimer({
  deadline,
  onExpire,
}: {
  deadline: string;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() => new Date(deadline).getTime() - Date.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const left = new Date(deadline).getTime() - Date.now();
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  const danger = remaining <= 2 * 60 * 1000;
  return (
    <span
      className={`sandbox-timer${danger ? " sandbox-timer--danger" : ""}`}
      role="timer"
      aria-label="Time remaining"
    >
      {formatRemaining(remaining)}
    </span>
  );
}
