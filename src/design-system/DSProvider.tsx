import * as React from "react";
import "./tokens.css";

/**
 * Wrap any NEW page/feature with <DSProvider> to opt-in to the Design System.
 * This never affects existing pages.
 *
 * Usage:
 *   <DSProvider>
 *     <MyNewPage />
 *   </DSProvider>
 */
export function DSProvider({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-ds-scope dir="rtl" className={`min-h-full bg-[#F8FAFC] ${className}`}>
      {children}
    </div>
  );
}
