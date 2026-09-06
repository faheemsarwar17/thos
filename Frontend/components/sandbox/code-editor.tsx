"use client";

import { useRef, type KeyboardEvent } from "react";

const LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "go",
  "rust",
  "sql",
  "text",
];

/**
 * Zero-dependency code editor: monospace textarea with CSS-counter line
 * numbers, Tab → two spaces, and a display-only language selector.
 */
export function CodeEditor({
  value,
  language,
  onChange,
  onLanguageChange,
  disabled = false,
}: {
  value: string;
  language: string;
  onChange: (value: string) => void;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart, selectionEnd } = el;
    onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`);
    requestAnimationFrame(() => {
      el.selectionStart = selectionStart + 2;
      el.selectionEnd = selectionStart + 2;
    });
  };

  return (
    <div className="sandbox-editor">
      <div className="sandbox-editor__toolbar">
        <label className="eyebrow" htmlFor="sandbox-language" style={{ margin: 0 }}>
          Language
        </label>
        <select
          id="sandbox-language"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
          disabled={disabled}
        >
          {LANGUAGES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="sandbox-editor__body">
        <div className="sandbox-editor__gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <textarea
          className="sandbox-editor__textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(event) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={disabled}
          aria-label="Code editor"
        />
      </div>
    </div>
  );
}
