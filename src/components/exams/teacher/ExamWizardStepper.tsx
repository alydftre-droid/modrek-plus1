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
    <div className="flex items-center justify-center gap-2 md:gap-4 px-3 py-4 overflow-x-auto">
      {steps.map((step, index) => {
        const done = index < currentIdx;
        const active = index === currentIdx;

        return (
          <div key={step.id} className="flex items-center gap-2 md:gap-4 shrink-0">
            <button
              type="button"
              onClick={() => onStepClick?.(step.id)}
              className="flex min-w-[72px] flex-col items-center gap-2"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition-all md:h-11 md:w-11",
                  active && "border-violet-600 bg-violet-600 text-white shadow-[0_0_0_4px_rgba(124,92,250,0.14)]",
                  done && !active && "border-violet-600 bg-violet-600 text-white",
                  !done && !active && "border-slate-200 bg-slate-50 text-slate-400"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-[12px] font-semibold leading-none md:text-sm",
                  active || done ? "text-violet-700" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-[2px] w-10 rounded-full md:w-20",
                  done ? "bg-violet-500" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
