interface Chip { key: string; label: string; count: number }
interface Props {
  chips: Chip[];
  active: string;
  onChange: (key: string) => void;
  totalLabel?: string;
}
export function GradeChipFilter({ chips, active, onChange, totalLabel = "الكل" }: Props) {
  const total = chips.reduce((s, c) => s + c.count, 0);
  const items = [{ key: "all", label: totalLabel, count: total }, ...chips];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((c) => {
        const isActive = active === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onChange(c.key)}
            className={`px-3 h-9 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border transition ${
              isActive
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            <span>{c.label}</span>
            <span className={`px-1.5 rounded-full text-[10px] tabular-nums ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>
              {c.count.toLocaleString("ar-EG")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
