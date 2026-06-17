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
    <div className="flex items-center justify-center gap-2 md:gap-4 py-3 px-4 overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.id} className="flex items-center gap-2 md:gap-4 shrink-0">
            <button
              type="button"
              onClick={() => onStepClick?.(s.id)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs md:text-sm font-medium transition-colors",
                  active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className={cn("h-0.5 w-8 md:w-16 rounded-full", done ? "bg-primary" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
