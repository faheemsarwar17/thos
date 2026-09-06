"use client";

import { useEffect, useRef } from "react";

/**
 * Anti-cheat core for the proctored sandbox.
 *
 * While enabled it: locks fullscreen (exit ⇒ immediate auto-submit), blocks
 * clipboard and inspector shortcuts, prevents paste/copy/cut/context menus,
 * and logs tab switches / focus loss (the third one auto-submits).
 *
 * Honesty note: a browser cannot make cheating impossible — this is
 * industry-standard deterrence paired with a recording for review.
 */

const BLOCKED_SHORTCUT_KEYS = new Set(["c", "v", "x", "s", "u", "p"]);
const DEVTOOLS_SHIFT_KEYS = new Set(["i", "j", "c"]);
const MAX_VIOLATIONS = 3;

export function useProctoring({
  enabled,
  onViolation,
  onForceSubmit,
}: {
  enabled: boolean;
  onViolation: (type: string, detail: string) => void;
  onForceSubmit: (reason: string) => void;
}) {
  const violationsRef = useRef(0);
  const callbacksRef = useRef({ onViolation, onForceSubmit });
  callbacksRef.current = { onViolation, onForceSubmit };

  useEffect(() => {
    if (!enabled) return;

    const reportViolation = (type: string, detail: string) => {
      violationsRef.current += 1;
      callbacksRef.current.onViolation(type, detail);
      if (violationsRef.current >= MAX_VIOLATIONS) {
        callbacksRef.current.onForceSubmit("repeated_violations");
      }
    };

    const onKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const blockedCombo = modifier && BLOCKED_SHORTCUT_KEYS.has(key);
      const devtools =
        event.key === "F12" || (modifier && event.shiftKey && DEVTOOLS_SHIFT_KEYS.has(key));
      if (blockedCombo || devtools) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === "PrintScreen") {
        // Best effort: clear the clipboard so a screenshot cannot be pasted.
        void navigator.clipboard?.writeText("").catch(() => undefined);
      }
    };

    const blockClipboardEvent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        callbacksRef.current.onForceSubmit("fullscreen_exit");
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        reportViolation("tab_switch", "The assessment tab lost visibility.");
      }
    };
    const onBlur = () => reportViolation("window_blur", "The assessment window lost focus.");

    document.addEventListener("keydown", onKeydown, true);
    for (const type of ["paste", "copy", "cut", "contextmenu"]) {
      document.addEventListener(type, blockClipboardEvent, true);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("keydown", onKeydown, true);
      for (const type of ["paste", "copy", "cut", "contextmenu"]) {
        document.removeEventListener(type, blockClipboardEvent, true);
      }
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);
}

export function enterFullscreen(): Promise<void> {
  return document.documentElement.requestFullscreen();
}
