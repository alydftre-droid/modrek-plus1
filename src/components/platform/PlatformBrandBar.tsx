import { GraduationCap } from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform";

/**
 * Slim tenant branding bar. Rendered only inside a teacher platform so the
 * student/teacher dashboards carry the platform identity instead of the
 * official Modrek Plus identity.
 */
export default function PlatformBrandBar() {
  const { platform } = usePlatform();
  if (!platform) return null;

  const accent = platform.brand_color || "hsl(var(--primary))";

  return (
    <div
      dir="rtl"
      className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium text-white"
      style={{ background: accent }}
    >
      {platform.logo_url ? (
        <img src={platform.logo_url} alt="" className="h-5 w-5 rounded object-cover" />
      ) : (
        <GraduationCap className="h-4 w-4" />
      )}
      <span className="truncate">{platform.name}</span>
    </div>
  );
}
