"use client";

import { useEffect, useState } from "react";
import { LuSun, LuMoon } from "react-icons/lu";
import { cn } from "@/lib/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("thos-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    } else if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      setTheme("light");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  // Stay in sync when another control (e.g. the command palette) flips the theme.
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    window.addEventListener("thos-theme-change", sync);
    return () => window.removeEventListener("thos-theme-change", sync);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("thos-theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.dispatchEvent(new Event("thos-theme-change"));
  };

  if (!mounted) {
    return (
      <div
        className={cn("icon-button", className)}
        data-placeholder
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      className={cn("icon-button focus-ring", className)}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      onClick={toggleTheme}
    >
      {theme === "light" ? (
        <LuMoon size={17} aria-hidden="true" />
      ) : (
        <LuSun size={17} aria-hidden="true" />
      )}
    </button>
  );
}
