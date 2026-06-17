import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;
}

interface Props {
  steps: WizardStep[];
  currentStep: string;
  onStepClick?: (id: string) => void;
}

export default function ExamWizardStepper({ steps, currentStep, onStepClick }: Props) {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="exam-review-stepper flex w-full items-start justify-center overflow-hidden px-1 py-1 md:gap-1 md:py-1.5">
      {steps.map((step, index) => {
        const done = index < currentIdx;
        const active = index === currentIdx;

        return (
          <div key={step.id} className="flex min-w-0 flex-1 items-start">
            <button
              type="button"
              onClick={() => onStepClick?.(step.id)}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all md:h-8 md:w-8 md:text-xs",
                  active && "border-violet-600 bg-violet-600 text-white shadow-[0_12px_24px_rgba(124,77,255,0.22)]",
                  done && !active && "border-violet-600 bg-violet-600 text-white shadow-[0_12px_24px_rgba(124,77,255,0.18)]",
                  !done && !active && "border-slate-200 bg-slate-200 text-slate-400"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span
                className={cn(
                  "w-full truncate px-0.5 text-center text-[9px] font-bold leading-none [letter-spacing:0] [word-spacing:0] md:text-xs",
                  active || done ? "text-violet-700" : "text-slate-500"
                )}
              >
                {step.label}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mt-3 h-px w-5 shrink-0 rounded-full md:mt-4 md:w-24",
                  done ? "bg-violet-600" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
