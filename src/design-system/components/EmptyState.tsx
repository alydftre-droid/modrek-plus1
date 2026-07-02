import * as React from "react";
import {
  Inbox, BookOpen, Bell, FileText, GraduationCap, Users, SearchX, type LucideIcon,
} from "lucide-react";

export type DSEmptyKind =
  | "generic" | "courses" | "notifications" | "exams" | "students" | "teachers" | "search";

const map: Record<DSEmptyKind, { icon: LucideIcon; title: string; description: string }> = {
  generic:       { icon: Inbox,        title: "لا توجد بيانات",     description: "لم يتم العثور على أي عناصر لعرضها حاليًا." },
  courses:       { icon: BookOpen,     title: "لا توجد كورسات",     description: "لم يتم إضافة كورسات بعد." },
  notifications: { icon: Bell,         title: "لا توجد إشعارات",    description: "ستظهر الإشعارات هنا فور وصولها." },
  exams:         { icon: FileText,     title: "لا توجد اختبارات",   description: "لم يتم إنشاء أي اختبار حتى الآن." },
  students:      { icon: GraduationCap,title: "لا يوجد طلاب",       description: "لم يسجّل أي طالب بعد." },
  teachers:      { icon: Users,        title: "لا يوجد معلمون",     description: "لم يسجّل أي معلم بعد." },
  search:        { icon: SearchX,      title: "لا توجد نتائج",      description: "جرّب تعديل كلمات البحث أو الفلاتر." },
};

export interface DSEmptyStateProps {
  kind?: DSEmptyKind;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function DSEmptyState({ kind = "generic", title, description, icon, action, className = "" }: DSEmptyStateProps) {
  const preset = map[kind];
  const Icon = icon || preset.icon;
  return (
    <div className={`bg-white border border-dashed border-[#E2E8F0] rounded-[14px] py-12 px-6 text-center ${className}`}>
      <div className="mx-auto h-14 w-14 rounded-[14px] bg-[#F1F5F9] text-[#94A3B8] flex items-center justify-center mb-3">
        <Icon className="h-7 w-7" />
      </div>
      <h4 className="text-[15px] font-bold text-[#0F172A]">{title ?? preset.title}</h4>
      <p className="text-[13px] text-[#475569] mt-1 max-w-sm mx-auto leading-6">
        {description ?? preset.description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
