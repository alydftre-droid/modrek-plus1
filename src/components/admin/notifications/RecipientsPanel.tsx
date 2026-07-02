import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GraduationCap, Users, User, UserRound, Search, Loader2,
  CheckSquare, Shuffle, Eraser, Target,
} from "lucide-react";
import type { TargetConfig, ResolvedUser, AudienceType, SelectionMethod } from "./types";
import { resolveRecipients } from "./resolveRecipients";

/* ============================================================
   DS-Compliant Recipients Panel — solid palette, white cards
   ============================================================ */

const INPUT =
  "h-[52px] rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-[#2563EB]";

const SELECT_TRIGGER =
  "h-[52px] rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]";

const AUDIENCES: { key: AudienceType; label: string; icon: any; color: string; disabled?: boolean }[] = [
  { key: "students", label: "الطلاب",         icon: GraduationCap, color: "#2563EB" },
  { key: "teachers", label: "المعلمين",       icon: User,          color: "#7C3AED" },
  { key: "parents",  label: "أولياء الأمور",   icon: UserRound,     color: "#EA580C", disabled: true },
  { key: "all",      label: "الجميع",          icon: Users,         color: "#059669" },
];

const STUDENT_METHODS: { value: SelectionMethod; label: string }[] = [
  { value: "all", label: "كل الطلاب" },
  { value: "manual", label: "تحديد يدوي (بحث)" },
  { value: "by_stage", label: "حسب المرحلة" },
  { value: "by_grade", label: "حسب الصف" },
  { value: "by_subject", label: "حسب المادة" },
  { value: "by_group", label: "حسب المجموعة" },
  { value: "by_teacher", label: "طلاب معلم معين" },
  { value: "new_users", label: "طلاب جدد" },
  { value: "inactive", label: "طلاب غير نشطين" },
  { value: "expired_subscription", label: "منتهي اشتراكهم" },
  { value: "expiring_soon", label: "سينتهي اشتراكهم قريباً" },
];

const TEACHER_METHODS: { value: SelectionMethod; label: string }[] = [
  { value: "all", label: "كل المعلمين" },
  { value: "manual", label: "تحديد يدوي (بحث)" },
  { value: "by_subject", label: "حسب المادة" },
  { value: "new_users", label: "معلمين جدد" },
  { value: "inactive", label: "معلمين غير نشطين" },
  { value: "top_teachers", label: "أعلى المبيعات" },
  { value: "pending_withdrawal", label: "لديهم طلب سحب" },
];

const STAGES = [
  { value: "primary", label: "ابتدائي" },
  { value: "preparatory", label: "إعدادي" },
  { value: "secondary", label: "ثانوي" },
];
const GRADES = [
  { value: "first", label: "الأول" },
  { value: "second", label: "الثاني" },
  { value: "third", label: "الثالث" },
];

export default function RecipientsPanel({
  config, onChange, onResolved,
}: {
  config: TargetConfig;
  onChange: (next: TargetConfig) => void;
  onResolved: (users: ResolvedUser[]) => void;
}) {
  const methods = config.audience === "teachers" ? TEACHER_METHODS : STUDENT_METHODS;

  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [subs, grps, tchs] = await Promise.all([
        supabase.from("subjects").select("id, name").eq("is_active", true).order("name").limit(500),
        supabase.from("content_groups").select("id, title").eq("is_active", true).order("title").limit(500),
        supabase.from("profiles").select("id, full_name").eq("role", "teacher").order("full_name").limit(500),
      ]);
      setSubjects((subs.data as any) || []);
      setGroups((grps.data as any) || []);
      setTeachers((tchs.data as any) || []);
    })();
  }, []);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ResolvedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const manualIds = config.manualIds || [];

  useEffect(() => {
    if (config.method !== "manual") return;
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const q = search.trim();
      const role = config.audience === "teachers" ? "teacher" : "student";
      const codeCol = role === "teacher" ? "teacher_code" : "student_code";
      const { data } = await supabase.from("profiles")
        .select("id, full_name, email, phone, role, student_code, teacher_code")
        .eq("role", role)
        .or(`full_name.ilike.%${q}%,${codeCol}.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(200);
      setSearchResults((data || []) as ResolvedUser[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, config.method, config.audience]);

  const toggleManual = (u: ResolvedUser) => {
    const has = manualIds.includes(u.id);
    const next = has ? manualIds.filter((x) => x !== u.id) : [...manualIds, u.id];
    onChange({ ...config, manualIds: next });
  };

  const selectAllShown = () => {
    const ids = searchResults.map((u) => u.id);
    const merged = Array.from(new Set([...(manualIds || []), ...ids]));
    onChange({ ...config, manualIds: merged });
  };
  const invertShown = () => {
    const shownIds = searchResults.map((u) => u.id);
    const current = new Set(manualIds || []);
    shownIds.forEach((id) => { if (current.has(id)) current.delete(id); else current.add(id); });
    onChange({ ...config, manualIds: Array.from(current) });
  };
  const clearAll = () => onChange({ ...config, manualIds: [] });

  const resolveKey = useMemo(() => JSON.stringify({
    a: config.audience, m: config.method, s: config.stage, g: config.grade,
    sub: config.subjectId, gr: config.groupId, t: config.teacherId,
    w: config.windowDays, ids: config.manualIds,
  }), [config]);

  const [count, setCount] = useState(0);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      try {
        const users = await resolveRecipients(config);
        if (cancelled) return;
        setCount(users.length);
        onResolved(users);
      } catch (e) {
        console.error(e);
        if (!cancelled) { setCount(0); onResolved([]); }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveKey]);

  const updateAudience = (a: AudienceType) => {
    onChange({ audience: a, method: "all" });
  };

  return (
    <div className="space-y-5" style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}>
      {/* Audience */}
      <div>
        <div className="text-[16px] font-bold text-[#0F172A] mb-3 pb-2 border-b border-[#E5E7EB]">
          نوع المستهدف
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {AUDIENCES.map((a) => {
            const Icon = a.icon;
            const selected = config.audience === a.key;
            return (
              <button
                key={a.key}
                disabled={a.disabled}
                onClick={() => updateAudience(a.key)}
                className="relative overflow-hidden rounded-[14px] p-3 text-right border transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={
                  selected
                    ? { background: a.color, color: "#fff", borderColor: a.color, boxShadow: `0 8px 20px ${a.color}33` }
                    : { background: "#fff", color: "#0F172A", borderColor: "#E5E7EB" }
                }
              >
                <div
                  className="h-10 w-10 rounded-[10px] flex items-center justify-center mb-2"
                  style={{
                    background: selected ? "rgba(255,255,255,0.15)" : `${a.color}14`,
                    color: selected ? "#fff" : a.color,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div className="text-[14px] font-bold">{a.label}</div>
                {a.disabled && <div className="text-[10px] mt-0.5 font-semibold text-[#94A3B8]">قريباً</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection method */}
      {config.audience !== "all" && config.audience !== "parents" && (
        <div>
          <label className="text-[13px] font-semibold text-[#334155] mb-2 block">طريقة التحديد</label>
          <Select value={config.method} onValueChange={(v) => onChange({ ...config, method: v as SelectionMethod })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
            <SelectContent>
              {methods.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Parameter inputs */}
      <div className="space-y-3">
        {config.method === "by_stage" && (
          <Select value={config.stage} onValueChange={(v) => onChange({ ...config, stage: v })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
            <SelectContent>{STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_grade" && (
          <Select value={config.grade} onValueChange={(v) => onChange({ ...config, grade: v })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="اختر الصف" /></SelectTrigger>
            <SelectContent>{GRADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_subject" && (
          <Select value={config.subjectId} onValueChange={(v) => onChange({ ...config, subjectId: v })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="اختر المادة" /></SelectTrigger>
            <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_group" && (
          <Select value={config.groupId} onValueChange={(v) => onChange({ ...config, groupId: v })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
            <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_teacher" && (
          <Select value={config.teacherId} onValueChange={(v) => onChange({ ...config, teacherId: v })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="اختر المعلم" /></SelectTrigger>
            <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {(config.method === "new_users" || config.method === "inactive" || config.method === "expiring_soon") && (
          <Select value={String(config.windowDays ?? 7)} onValueChange={(v) => onChange({ ...config, windowDays: Number(v) })}>
            <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">آخر يوم</SelectItem>
              <SelectItem value="3">آخر 3 أيام</SelectItem>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="14">آخر 14 يوم</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
            </SelectContent>
          </Select>
        )}

        {config.method === "manual" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم / الكود / الهاتف / البريد..."
                className={`pr-10 ${INPUT}`}
              />
              {searching && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#2563EB]" />}
            </div>

            {searchResults.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllShown}
                    className="h-9 px-3 rounded-[10px] text-[12px] font-semibold flex items-center gap-1.5 bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors"
                  >
                    <CheckSquare className="h-3.5 w-3.5" /> تحديد الكل ({searchResults.length})
                  </button>
                  <button
                    onClick={invertShown}
                    className="h-9 px-3 rounded-[10px] text-[12px] font-semibold flex items-center gap-1.5 bg-[#7C3AED] text-white hover:bg-[#6D28D9] transition-colors"
                  >
                    <Shuffle className="h-3.5 w-3.5" /> عكس التحديد
                  </button>
                </div>
                <div className="bg-white border border-[#E5E7EB] rounded-[14px] max-h-64 overflow-y-auto divide-y divide-[#F1F5F9]">
                  {searchResults.map((u) => {
                    const checked = manualIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-[#EFF6FF]"
                        style={checked ? { background: "#EFF6FF" } : undefined}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleManual(u)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#0F172A] truncate">{u.full_name}</div>
                          <div className="text-[11px] text-[#475569] truncate">
                            #{u.student_code || u.teacher_code || "-"} · {u.phone || u.email || "-"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {manualIds.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAll}
                  className="h-9 px-3 rounded-[10px] text-[12px] font-semibold flex items-center gap-1.5 bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                >
                  <Eraser className="h-3.5 w-3.5" /> إلغاء الكل
                </button>
                <span className="h-9 px-3 rounded-[10px] text-[12px] font-bold flex items-center bg-[#EFF6FF] text-[#2563EB]">
                  {manualIds.length} محدد
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recipients count */}
      <div
        className="rounded-[16px] p-4 flex items-center gap-3"
        style={{ background: "#2563EB", color: "#fff", boxShadow: "0 8px 20px rgba(37,99,235,0.25)" }}
      >
        <div className="h-11 w-11 rounded-[12px] flex items-center justify-center bg-white/15">
          <Target className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-white/80">إجمالي المستلمين</div>
          {resolving ? (
            <Loader2 className="h-6 w-6 animate-spin text-white mt-1" />
          ) : (
            <div className="text-[24px] font-bold tabular-nums leading-tight">
              {count.toLocaleString("ar-EG")}
              <span className="text-[12px] font-medium text-white/85 mr-2">مستخدم</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
