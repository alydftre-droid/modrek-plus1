import { LucideIcon, Inbox } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}
export function EmptyState({ icon: Icon = Inbox, title, description, action }: Props) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 px-6 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-3">
        <Icon className="h-7 w-7" />
      </div>
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      {description && <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
