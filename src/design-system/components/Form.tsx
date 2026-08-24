import * as React from "react";
import { Search, ChevronDown } from "lucide-react";

const fieldBase =
  "w-full h-11 px-3 text-[14px] rounded-[10px] border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] transition-colors duration-150 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:bg-[#F1F5F9] disabled:cursor-not-allowed";

export interface DSLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}
export function DSLabel({ required, className = "", children, ...p }: DSLabelProps) {
  return (
    <label className={`block text-[13px] font-semibold text-[#0F172A] mb-1.5 ${className}`} {...p}>
      {children}
      {required && <span className="text-[#DC2626] mr-1">*</span>}
    </label>
  );
}

export function DSHelpText({ tone = "muted", children }: { tone?: "muted" | "error"; children: React.ReactNode }) {
  const color = tone === "error" ? "text-[#DC2626]" : "text-[#94A3B8]";
  return <p className={`text-[12px] mt-1.5 ${color}`}>{children}</p>;
}

export interface DSInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}
export const DSInput = React.forwardRef<HTMLInputElement, DSInputProps>(
  ({ label, error, hint, required, id, className = "", ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    return (
      <div>
        {label && <DSLabel htmlFor={inputId} required={required}>{label}</DSLabel>}
        <input
          ref={ref}
          id={inputId}
          className={`${fieldBase} ${error ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/20" : ""} ${className}`}
          {...props}
        />
        {(error || hint) && <DSHelpText tone={error ? "error" : "muted"}>{error || hint}</DSHelpText>}
      </div>
    );
  },
);
DSInput.displayName = "DSInput";

export interface DSTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}
export const DSTextarea = React.forwardRef<HTMLTextAreaElement, DSTextareaProps>(
  ({ label, error, hint, required, id, className = "", rows = 4, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    return (
      <div>
        {label && <DSLabel htmlFor={inputId} required={required}>{label}</DSLabel>}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className={`${fieldBase} h-auto py-2.5 leading-6 ${error ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/20" : ""} ${className}`}
          {...props}
        />
        {(error || hint) && <DSHelpText tone={error ? "error" : "muted"}>{error || hint}</DSHelpText>}
      </div>
    );
  },
);
DSTextarea.displayName = "DSTextarea";

export interface DSSearchProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export const DSSearch = React.forwardRef<HTMLInputElement, DSSearchProps>(
  ({ className = "", placeholder = "بحث...", ...props }, ref) => (
    <div className="relative">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
      <input ref={ref} placeholder={placeholder} className={`${fieldBase} pr-9 ${className}`} {...props} />
    </div>
  ),
);
DSSearch.displayName = "DSSearch";

export interface DSSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}
export const DSSelect = React.forwardRef<HTMLSelectElement, DSSelectProps>(
  ({ label, error, hint, required, id, className = "", children, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    return (
      <div>
        {label && <DSLabel htmlFor={inputId} required={required}>{label}</DSLabel>}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            className={`${fieldBase} appearance-none pl-9 ${error ? "border-[#DC2626]" : ""} ${className}`}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
        </div>
        {(error || hint) && <DSHelpText tone={error ? "error" : "muted"}>{error || hint}</DSHelpText>}
      </div>
    );
  },
);
DSSelect.displayName = "DSSelect";

// Checkbox
export interface DSCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}
export const DSCheckbox = React.forwardRef<HTMLInputElement, DSCheckboxProps>(
  ({ label, className = "", id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    return (
      <label htmlFor={inputId} className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className={`h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] ${className}`}
          {...props}
        />
        {label && <span className="text-[14px] text-[#0F172A]">{label}</span>}
      </label>
    );
  },
);
DSCheckbox.displayName = "DSCheckbox";

// Radio
export interface DSRadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}
export const DSRadio = React.forwardRef<HTMLInputElement, DSRadioProps>(
  ({ label, className = "", id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    return (
      <label htmlFor={inputId} className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          className={`h-4 w-4 border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] ${className}`}
          {...props}
        />
        {label && <span className="text-[14px] text-[#0F172A]">{label}</span>}
      </label>
    );
  },
);
DSRadio.displayName = "DSRadio";

// Switch
export interface DSSwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  id?: string;
}
export function DSSwitch({ checked, onCheckedChange, disabled, label, id }: DSSwitchProps) {
  const autoId = React.useId();
  const inputId = id || autoId;
  return (
    <label htmlFor={inputId} className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
        } disabled:opacity-60`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-1" : "translate-x-5"
          }`}
        />
      </button>
      {label && <span className="text-[14px] text-[#0F172A]">{label}</span>}
    </label>
  );
}
