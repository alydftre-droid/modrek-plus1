import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatSectionLabel,
  normalizeSectionForSubjects,
} from "@/lib/educationSection";

/**
 * Read-only informational chip that displays the section (شعبة) an exam will
 * target, sourced from the linked content group / subject. Purely presentational:
 * it does NOT change any filtering, group binding, or subject_id resolution.
 * Rendered on the exam creation surfaces so teachers see the same context they
 * see when uploading video/content.
 */
export default function ExamSectionBadge({
  groupId,
  subjectId,
}: {
  groupId?: string | null;
  subjectId?: string | null;
}) {
  const { data } = useQuery({
    queryKey: ["exam-section-badge", groupId || null, subjectId || null],
    enabled: Boolean(groupId || subjectId),
    staleTime: 60_000,
    queryFn: async () => {
      let sectionRaw: string | null = null;
      let eduTypeRaw: string | null = null;
      let stageRaw: string | null = null;
      let subjectName: string | null = null;

      if (groupId) {
        const { data: group } = await supabase
          .from("content_groups")
          .select("subject_id, section_name, education_type")
          .eq("id", groupId)
          .maybeSingle();
        if (group) {
          sectionRaw = (group as any).section_name || null;
          eduTypeRaw = (group as any).education_type || null;
          if (!subjectId) subjectId = (group as any).subject_id || null;
        }
      }

      if (subjectId) {
        const { data: subject } = await supabase
          .from("subjects")
          .select("name, section, stage")
          .eq("id", subjectId)
          .maybeSingle();
        if (subject) {
          subjectName = (subject as any).name || null;
          stageRaw = (subject as any).stage || null;
          if (!sectionRaw) sectionRaw = (subject as any).section || null;
        }
      }

      return { sectionRaw, eduTypeRaw, stageRaw, subjectName };
    },
  });

  if (!data) return null;

  const normalized = normalizeSectionForSubjects(data.sectionRaw);
  const sectionLabel = normalized
    ? formatSectionLabel(normalized)
    : data.sectionRaw
    ? formatSectionLabel(data.sectionRaw)
    : null;

  const isSecondary = data.stageRaw === "secondary";
  const eduLabel = data.eduTypeRaw
    ? data.eduTypeRaw === "azhar" || data.eduTypeRaw === "أزهر"
      ? "أزهر"
      : data.eduTypeRaw === "general" || data.eduTypeRaw === "عام"
      ? "عام"
      : data.eduTypeRaw
    : null;

  if (!sectionLabel && !eduLabel && !data.subjectName) return null;

  return (
    <div
      dir="rtl"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200/70 bg-violet-50/70 px-3 py-2 text-[12px] font-bold text-violet-800 shadow-sm dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-200"
    >
      <span className="inline-flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" />
        استهداف الامتحان:
      </span>
      {data.subjectName ? (
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-violet-700 dark:bg-white/10 dark:text-violet-100">
          {data.subjectName}
        </span>
      ) : null}
      {sectionLabel && isSecondary ? (
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-violet-700 dark:bg-white/10 dark:text-violet-100">
          الشعبة: {sectionLabel}
        </span>
      ) : null}
      {eduLabel ? (
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-violet-700 dark:bg-white/10 dark:text-violet-100">
          النوع: {eduLabel}
        </span>
      ) : null}
      <span className="mr-auto text-[10px] font-normal text-violet-600/80 dark:text-violet-300/80">
        محدد تلقائياً من المجموعة
      </span>
    </div>
  );
}
