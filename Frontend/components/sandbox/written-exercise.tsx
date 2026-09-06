"use client";

import type { SandboxWrittenExercise } from "@/lib/types";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Typed long-form answers with a live word count against each minimum. */
export function WrittenExercise({
  exercise,
  answers,
  onChange,
  disabled = false,
}: {
  exercise: SandboxWrittenExercise;
  answers: Record<string, string>;
  onChange: (promptId: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="sandbox-written">
      {exercise.prompts.map((prompt, index) => {
        const value = answers[prompt.id] ?? "";
        const words = wordCount(value);
        const met = words >= prompt.min_words;
        return (
          <section key={prompt.id} className="sandbox-written__prompt">
            <p className="eyebrow">
              Question {index + 1} of {exercise.prompts.length}
            </p>
            <p className="sandbox-written__question">{prompt.question}</p>
            <textarea
              value={value}
              onChange={(event) => onChange(prompt.id, event.target.value)}
              disabled={disabled}
              rows={10}
              aria-label={`Answer to question ${index + 1}`}
            />
            <p className={`sandbox-written__count${met ? " sandbox-written__count--met" : ""}`}>
              {words} / {prompt.min_words} words minimum
            </p>
          </section>
        );
      })}
    </div>
  );
}
