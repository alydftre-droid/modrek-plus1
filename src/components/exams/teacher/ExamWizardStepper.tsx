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
    <div className="flex items-center justify-center gap-1.5 overflow-x-auto px-2 py-2 md:gap-3 md:py-3">
      {steps.map((step, index) => {
        const done = index < currentIdx;
        const active = index === currentIdx;

        return (
          <div key={step.id} className="flex shrink-0 items-center gap-1.5 md:gap-3">
            <button
              type="button"
              onClick={() => onStepClick?.(step.id)}
              className="flex min-w-[54px] flex-col items-center gap-1 md:min-w-[68px]"
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-all md:h-8 md:w-8 md:text-xs",
                  active && "border-violet-300 bg-violet-50 text-violet-700 shadow-[0_0_0_3px_rgba(124,58,237,0.10)]",
                  done && !active && "border-violet-200 bg-violet-50 text-violet-600",
                  !done && !active && "border-slate-200 bg-slate-50 text-slate-400"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold leading-none md:text-xs",
                  active || done ? "text-violet-700" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 rounded-full md:w-12",
                  done ? "bg-violet-200" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
