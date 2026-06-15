import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, autoComplete, autoCorrect, autoCapitalize, spellCheck, ...props }, ref) => {
    const isSensitive = type === "password" || type === "email" || type === "tel" || type === "url" || type === "number";
    return (
      <input
        type={type}
        // Enable native keyboard suggestions/auto-correct by default; opt-out for sensitive fields
        autoComplete={autoComplete ?? (isSensitive ? "off" : "on")}
        autoCorrect={autoCorrect ?? (isSensitive ? "off" : "on")}
        autoCapitalize={autoCapitalize ?? (isSensitive ? "off" : "sentences")}
        spellCheck={spellCheck ?? !isSensitive}
        className={cn(
          "flex h-12 w-full rounded-lg border-2 border-input bg-card px-4 py-2 text-base ring-offset-background transition-all duration-200",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-primary/50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
