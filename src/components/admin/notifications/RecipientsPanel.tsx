import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, User, UserRound, Search, Loader2, X } from "lucide-react";
import type { TargetConfig, ResolvedUser, AudienceType, SelectionMethod } from "./types";
import { resolveRecipients } from "./resolveRecipients";

const AUDIENCES: { key: AudienceType; label: string; icon: any; disabled?: boolean }[] = [
  { key: "students", label: "الطلاب",         icon: GraduationCap },
  { key: "teachers", label: "المعلمين",       icon: User },
  { key: "parents",  label: "أولياء الأمور",   icon: UserRound, disabled: true },
  { key: "all",      label: "الجميع",          icon: Users },
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

  // Manual search
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
        .limit(30);
      setSearchResults((data || []) as ResolvedUser[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, config.method, config.audience]);

  const [manualUsers, setManualUsers] = useState<Record<string, ResolvedUser>>({});
  const toggleManual = (u: ResolvedUser) => {
    const has = manualIds.includes(u.id);
    const next = has ? manualIds.filter((x) => x !== u.id) : [...manualIds, u.id];
    setManualUsers((prev) => ({ ...prev, [u.id]: u }));
    onChange({ ...config, manualIds: next });
  };

  // Resolve recipients whenever relevant params change
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
    <div className="space-y-5">
      {/* Audience cards */}
      <div>
        <div className="text-[13px] font-semibold text-slate-700 mb-2">١. نوع المستهدف</div>
        <div className="grid grid-cols-2 gap-2">
          {AUDIENCES.map((a) => {
            const Icon = a.icon;
            const selected = config.audience === a.key;
            return (
              <button
                key={a.key}
                disabled={a.disabled}
                onClick={() => updateAudience(a.key)}
                className={`relative rounded-2xl border p-3 text-right transition-all ${
                  selected
                    ? "border-indigo-500 bg-indigo-50/60 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } ${a.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-2 ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                {a.disabled && <div className="text-[10px] text-slate-400 mt-0.5">قريباً</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection method */}
      {config.audience !== "all" && config.audience !== "parents" && (
        <div>
          <div className="text-[13px] font-semibold text-slate-700 mb-2">٢. طريقة التحديد</div>
          <Select value={config.method} onValueChange={(v) => onChange({ ...config, method: v as SelectionMethod })}>
            <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
            <SelectContent>{STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_grade" && (
          <Select value={config.grade} onValueChange={(v) => onChange({ ...config, grade: v })}>
            <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
            <SelectContent>{GRADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_subject" && (
          <Select value={config.subjectId} onValueChange={(v) => onChange({ ...config, subjectId: v })}>
            <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر المادة" /></SelectTrigger>
            <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_group" && (
          <Select value={config.groupId} onValueChange={(v) => onChange({ ...config, groupId: v })}>
            <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
            <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {config.method === "by_teacher" && (
          <Select value={config.teacherId} onValueChange={(v) => onChange({ ...config, teacherId: v })}>
            <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر المعلم" /></SelectTrigger>
            <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {(config.method === "new_users" || config.method === "inactive" || config.method === "expiring_soon") && (
          <Select value={String(config.windowDays ?? 7)} onValueChange={(v) => onChange({ ...config, windowDays: Number(v) })}>
            <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">آخر يوم</SelectItem>
              <SelectItem value="3">آخر 3 أيام</SelectItem>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="14">آخر 14 يوم</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Manual search */}
        {config.method === "manual" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم / الكود / الهاتف / البريد..."
                className="pr-9 bg-white"
              />
              {searching && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
            </div>

            {searchResults.length > 0 && (
              <div className="bg-white border rounded-xl max-h-56 overflow-y-auto divide-y">
                {searchResults.map((u) => {
                  const checked = manualIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={() => toggleManual(u)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.full_name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          #{u.student_code || u.teacher_code || "-"} · {u.phone || u.email || "-"}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {manualIds.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ ...config, manualIds: [] })}>
                  إلغاء الكل
                </Button>
                <Badge className="bg-indigo-100 text-indigo-700 border-0">{manualIds.length} محدد</Badge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recipients count */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-100 p-4">
        <div className="text-[11px] text-indigo-700 font-medium mb-1">عدد المستلمين</div>
        <div className="flex items-baseline gap-2">
          {resolving ? (
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          ) : (
            <>
              <span className="text-3xl font-bold text-indigo-900 tabular-nums">{count.toLocaleString("ar-EG")}</span>
              <span className="text-sm text-indigo-700">مستخدم</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
