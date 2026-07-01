import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backTo?: number | string;
}
export function PageHeader({ title, subtitle, actions, backTo = -1 }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => (typeof backTo === "number" ? navigate(backTo as any) : navigate(backTo as string))}
          className="gap-1 h-9 border-slate-200"
        >
          <ArrowRight className="h-4 w-4 rotate-180" /> رجوع
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
