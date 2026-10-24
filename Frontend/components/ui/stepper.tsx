import type { ReactNode } from "react";
import { LuCheck } from "react-icons/lu";
import { cn } from "@/lib/cn";

type StepState = "done" | "current" | "upcoming";
export function Stepper({ steps, current, orientation = "horizontal", renderStep }: {
  steps: string[]; current: number; orientation?: "horizontal" | "vertical";
  renderStep?: (step: string, index: number, state: StepState) => ReactNode;
}) {
  return (
    <ol className={cn("stepper", `stepper--${orientation}`)} aria-label="Progress">
      {steps.map((step, i) => {
        const state: StepState = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li key={step} className={`stepper__step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stepper__dot" aria-hidden="true">{state === "done" ? <LuCheck size={11} /> : null}</span>
            <span className="stepper__body">{renderStep ? renderStep(step, i, state) : <span className="stepper__label">{step}</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}
