import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2, Plus, Copy, ExternalLink, Settings2, Users, Power, PowerOff, Archive, Loader2,
} from "lucide-react";
import { normalizePlatformSlug, platformUrl, platformFallbackUrl } from "@/lib/platformHost";
import TeacherRegistrationForm, { type TeacherFormData } from "@/components/auth/TeacherRegistrationForm";
import {
  resolveSubjectGroups, resolveSubjectIds, scopeFromSubjectIds, type PlatformSubjectRow,
} from "@/lib/platformSubjectResolution";
import { reportBackendError, reportRpcError } from "@/lib/rpcErrorReporter";

interface PlatformRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  brand_color: string | null;
  status: string;
  owner_teacher_id: string;
  teacher_name: string | null;
  teacher_email: string | null;
  subject_names: string[] | null;
  subject_ids: string[] | null;
  student_count: number;
  created_at: string;
}

interface TeacherOption { id: string; full_name: string; email: string | null }
type SubjectOption = PlatformSubjectRow;

const EMPTY_SCOPE: TeacherFormData = {
  school: "", employeeId: "", phone: "",
  stages: [], grades: [], subject: "", subjects: [], educationType: "",
  teachesIntegratedScience: false,
};

/** platforms/{platform_id}/branding/<file> — matches the storage RLS path contract. */
async function uploadPlatformLogo(platformId: string, file: File) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `platforms/${platformId}/branding/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("teacher-profiles").upload(path, file, {
    upsert: true, contentType: file.type,
  });
  if (error) throw error;
  return supabase.storage.from("teacher-profiles").getPublicUrl(path).data.publicUrl;
}


const STATUS_LABEL: Record<string, string> = {
  active: "نشطة",
  suspended: "متوقفة",
  archived: "مؤرشفة",
};

export default function AdminPlatformsPage() {
  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [manage, setManage] = useState<PlatformRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_teacher_platforms");
    if (error) {
      reportRpcError({
        title: "تعذر تحميل المنصات",
        error,
        operation: "RPC admin_list_teacher_platforms",
        sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:77",
      });
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data as PlatformRow[]) || []);
    setLoading(false);
  };


  useEffect(() => {
    load();
    supabase.from("profiles").select("id, full_name, email").eq("role", "teacher").order("full_name")
      .then(({ data }) => setTeachers((data as TeacherOption[]) || []));
    supabase.from("subjects").select("id, name, category, stage, grade, section").eq("is_active", true)
      .then(({ data }) => setSubjects((data as SubjectOption[]) || []));
  }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    stopped: rows.filter((r) => r.status !== "active").length,
    students: rows.reduce((sum, r) => sum + Number(r.student_count || 0), 0),
  }), [rows]);

  const setStatus = async (row: PlatformRow, status: string) => {
    const { error } = await supabase.rpc("admin_set_platform_status", {
      _platform_id: row.id, _status: status,
    });
    if (error) return reportRpcError({
      title: "تعذر تحديث حالة المنصة",
      error,
      operation: "RPC admin_set_platform_status",
      sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:104",
      context: { platform_id: row.id, requested_status: status },
    });
    toast.success("تم تحديث حالة المنصة");
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("تم نسخ الرابط"));
  };

  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl gradient-mudrik flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">منصات المعلمين</h1>
            <p className="text-sm text-muted-foreground">إنشاء وإدارة منصات تعليمية مستقلة لكل معلم</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> إنشاء منصة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المنصات", value: stats.total },
          { label: "المنصات النشطة", value: stats.active },
          { label: "المنصات المتوقفة", value: stats.stopped },
          { label: "إجمالي الطلاب", value: stats.students },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحميل...
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          لا توجد منصات بعد. ابدأ بإنشاء منصة جديدة لأحد المعلمين.
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((row) => (
            <Card key={row.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                    style={{ background: row.brand_color || "hsl(var(--primary))" }}
                  >
                    {row.logo_url
                      ? <img src={row.logo_url} alt={`شعار ${row.name}`} className="h-full w-full object-cover" />
                      : <Building2 className="h-5 w-5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{row.name}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{row.teacher_name || "—"}</p>
                  </div>
                  <Badge variant={row.status === "active" ? "default" : "secondary"} className="ms-auto">
                    {STATUS_LABEL[row.status] || row.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1">
                  {(row.subject_names || []).length === 0
                    ? <span className="text-muted-foreground text-xs">لا توجد مواد محددة</span>
                    : (row.subject_names || []).map((n) => (
                      <Badge key={n} variant="outline" className="text-xs">{n}</Badge>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Users className="h-3.5 w-3.5" /> {Number(row.student_count || 0)} طالب
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-xs break-all space-y-1">
                  <div className="font-medium">{platformFallbackUrl(row.slug)}</div>
                  <div className="text-muted-foreground">
                    {platformUrl(row.slug)} · يعمل بعد إضافة سجل DNS بديل (*) للنطاق
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => copy(platformFallbackUrl(row.slug))}>
                    <Copy className="h-3.5 w-3.5" /> نسخ
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" asChild>
                    <a href={platformFallbackUrl(row.slug)} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> فتح
                    </a>
                  </Button>

                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setManage(row)}>
                    <Settings2 className="h-3.5 w-3.5" /> إدارة
                  </Button>
                  {row.status === "active" ? (
                    <Button size="sm" variant="outline" className="gap-1 text-destructive"
                      onClick={() => setStatus(row, "suspended")}>
                      <PowerOff className="h-3.5 w-3.5" /> تعطيل
                    </Button>
                  ) : row.status === "suspended" ? (
                    <>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus(row, "active")}>
                        <Power className="h-3.5 w-3.5" /> تفعيل
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus(row, "archived")}>
                        <Archive className="h-3.5 w-3.5" /> أرشفة
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus(row, "active")}>
                      <Power className="h-3.5 w-3.5" /> استعادة
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreatePlatformDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teachers={teachers}
        subjects={subjects}
        onCreated={load}
      />

      <ManagePlatformDialog
        platform={manage}
        subjects={subjects}
        onOpenChange={(open) => { if (!open) setManage(null); }}
        onSaved={load}
      />
    </div>
  );
}

/**
 * Reuses the OFFICIAL teacher-registration selection screen (stage → grades → subjects
 * → education type) and shows which real subject rows it resolves to.
 */
function TeacherScopePicker({
  scope, onChange, subjects,
}: { scope: TeacherFormData; onChange: (patch: Partial<TeacherFormData>) => void; subjects: SubjectOption[] }) {
  const groups = useMemo(() => resolveSubjectGroups(scope, subjects), [scope, subjects]);
  return (
    <div className="space-y-4">
      <TeacherRegistrationForm
        formData={scope}
        onChange={onChange}
        errors={{}}
        hidePersonalFields
      />
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-xs font-semibold">
          المواد الرسمية التي سيتم ربطها بالمنصة ({groups.reduce((n, g) => n + g.ids.length, 0)})
        </p>
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">اختر المرحلة والصفوف والمواد أعلاه.</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {groups.map((g) => (
              <div key={`${g.selection}-${g.grade}`} className="text-xs flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">{g.grade}</Badge>
                <span className="font-medium shrink-0">{g.selection}</span>
                <span className="text-muted-foreground truncate">{g.names.join("، ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function CreatePlatformDialog({
  open, onOpenChange, teachers, subjects, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teachers: TeacherOption[];
  subjects: SubjectOption[];
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [teacherMode, setTeacherMode] = useState<"existing" | "new">("existing");
  const [teacherId, setTeacherId] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherEmail, setNewTeacherEmail] = useState("");
  const [newTeacherPassword, setNewTeacherPassword] = useState("");
  const [scope, setScope] = useState<TeacherFormData>(EMPTY_SCOPE);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [saving, setSaving] = useState(false);

  const subjectIds = useMemo(() => resolveSubjectIds(scope, subjects), [scope, subjects]);

  useEffect(() => {
    if (!open) {
      setStep(1); setName(""); setSlug(""); setDescription(""); setLogoUrl("");
      setLogoFile(null); setLogoPreview("");
      setBrandColor("#2563eb"); setTeacherId(""); setScope(EMPTY_SCOPE); setSlugState("idle");
      setTeacherMode("existing"); setNewTeacherName(""); setNewTeacherEmail(""); setNewTeacherPassword("");
    }
  }, [open]);

  useEffect(() => {
    if (!slug) { setSlugState("idle"); return; }
    setSlugState("checking");
    const t = setTimeout(async () => {
      const [reserved, existing] = await Promise.all([
        supabase.from("platform_reserved_slugs").select("slug").eq("slug", slug).maybeSingle(),
        supabase.from("teacher_platforms").select("id").eq("slug", slug).maybeSingle(),
      ]);
      setSlugState(reserved.data || existing.data ? "taken" : "free");
    }, 400);
    return () => clearTimeout(t);
  }, [slug]);

  const filteredTeachers = teachers.filter((t) =>
    !teacherQuery || (t.full_name || "").includes(teacherQuery) || (t.email || "").includes(teacherQuery));

  /**
   * The logo is stored under platforms/{platform_id}/branding/, so the file is kept
   * locally during the wizard and uploaded right after the platform row exists.
   */
  const pickLogo = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("اختر صورة صحيحة");
    if (file.size > 5 * 1024 * 1024) return toast.error("حجم الشعار يجب أن يكون أقل من 5 ميجابايت");
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    setSaving(true);
    try {
      let ownerId = teacherId;

      if (teacherMode === "new") {
        const traceId = crypto.randomUUID();
        const { data, error } = await supabase.functions.invoke("admin-create-platform-teacher", {
          headers: { "x-trace-id": traceId },
          body: {
            full_name: newTeacherName.trim(),
            email: newTeacherEmail.trim(),
            password: newTeacherPassword,
          },
        });
        const payload = data as { teacher_id?: string; error?: string } | null;
        if (error || !payload?.teacher_id) {
          await reportBackendError({
            title: "تعذر إنشاء حساب المعلم",
            error: error || payload || new Error("لم تُرجع الوظيفة معرّف المعلم"),
            responseData: payload,
            operation: "Edge Function admin-create-platform-teacher",
            sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:367",
            context: { trace_id: traceId, teacher_email_domain: newTeacherEmail.split("@")[1] || null },
          });
          return;
        }
        ownerId = payload.teacher_id;
      }

      const { data: newId, error } = await supabase.rpc("admin_create_teacher_platform", {
        _name: name,
        _slug: slug,
        _owner_teacher_id: ownerId,
        _subject_ids: subjectIds,
        _description: description || null,
        _logo_url: logoUrl || null,
        _brand_color: brandColor || null,
      });
      if (error) {
        reportRpcError({
          title: "تعذر إنشاء المنصة",
          error,
          operation: "RPC admin_create_teacher_platform",
          sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:392",
          context: { owner_teacher_id: ownerId, subject_count: subjectIds.length, slug },
        });
        return;
      }

      const platformId = newId as unknown as string;
      if (logoFile && platformId) {
        try {
          const url = await uploadPlatformLogo(platformId, logoFile);
          await supabase.rpc("admin_update_teacher_platform", {
            _platform_id: platformId,
            _name: name,
            _description: description || null,
            _logo_url: url,
            _brand_color: brandColor || null,
            _subject_ids: subjectIds,
          });
        } catch (e) {
          reportRpcError({
            title: "تم إنشاء المنصة لكن تعذر رفع الشعار",
            error: e,
            operation: "Storage teacher-profiles/platforms/branding",
            sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:415",
            context: { platform_id: platformId, file_type: logoFile.type, file_size: logoFile.size },
          });
        }
      }

      toast.success("تم إنشاء المنصة بنجاح");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const canNext =
    step === 1 ? Boolean(name.trim()) && slugState === "free"
    : step === 2
      ? (teacherMode === "existing"
          ? Boolean(teacherId)
          : newTeacherName.trim().length >= 3
            && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newTeacherEmail.trim())
            && newTeacherPassword.length >= 8)
    : subjectIds.length > 0;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إنشاء منصة جديدة</DialogTitle>
          <DialogDescription>الخطوة {step} من 3</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label>اسم المنصة</Label>
              <Input value={name} onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(normalizePlatformSlug(e.target.value));
              }} placeholder="أكاديمية أحمد" />
            </div>
            <div>
              <Label>اسم الرابط (slug)</Label>
              <Input value={slug} onChange={(e) => setSlug(normalizePlatformSlug(e.target.value))} placeholder="ahmed" />
              <p className="text-xs mt-1 text-muted-foreground break-all">
                {slug ? platformFallbackUrl(slug) : "—"}
                {slugState === "checking" && " · جارٍ التحقق..."}
                {slugState === "free" && " · متاح ✅"}
                {slugState === "taken" && " · غير متاح ❌"}
              </p>
            </div>
            <div>
              <Label>شعار المنصة (اختياري)</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-14 w-14 rounded-xl overflow-hidden border flex items-center justify-center shrink-0"
                  style={{ background: brandColor }}>
                  {(logoPreview || logoUrl)
                    ? <img src={logoPreview || logoUrl} alt="شعار المنصة" className="h-full w-full object-cover" />
                    : <Building2 className="h-5 w-5 text-white" />}
                </div>
                <div className="flex-1 space-y-2">
                  <Input type="file" accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); }} />
                  <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="أو الصق رابط الشعار https://..." />
                </div>
              </div>
              {logoFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  سيتم رفع الشعار تلقائيًا بعد إنشاء المنصة.
                </p>
              )}
            </div>

            <div>
              <Label>لون الهوية</Label>
              <Input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-10 w-24 p-1" />
            </div>
            <div>
              <Label>وصف (اختياري)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={teacherMode === "existing" ? "default" : "outline"}
                onClick={() => setTeacherMode("existing")}>معلم موجود</Button>
              <Button type="button" variant={teacherMode === "new" ? "default" : "outline"}
                onClick={() => setTeacherMode("new")}>معلم جديد</Button>
            </div>

            {teacherMode === "existing" ? (
              <div className="space-y-2">
                <Label>اختر المعلم</Label>
                <Input placeholder="ابحث بالاسم أو البريد..." value={teacherQuery} onChange={(e) => setTeacherQuery(e.target.value)} />
                <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                  {filteredTeachers.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTeacherId(t.id)}
                      className={`w-full text-start p-2 text-sm hover:bg-muted/40 ${teacherId === t.id ? "bg-primary/10" : ""}`}
                    >
                      <div className="font-medium">{t.full_name}</div>
                      <div className="text-xs text-muted-foreground">{t.email}</div>
                    </button>
                  ))}
                  {filteredTeachers.length === 0 && <p className="p-3 text-xs text-muted-foreground">لا نتائج</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>اسم المعلم</Label>
                  <Input value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} placeholder="أحمد محمد" />
                </div>
                <div>
                  <Label>البريد الإلكتروني (حساب الدخول)</Label>
                  <Input type="email" dir="ltr" value={newTeacherEmail}
                    onChange={(e) => setNewTeacherEmail(e.target.value)} placeholder="teacher@gmail.com" />
                </div>
                <div>
                  <Label>كلمة المرور</Label>
                  <Input type="text" dir="ltr" value={newTeacherPassword}
                    onChange={(e) => setNewTeacherPassword(e.target.value)} placeholder="8 أحرف على الأقل" />
                  <p className="text-xs text-muted-foreground mt-1">
                    سيتم إنشاء حساب معلم جديد مؤكد البريد، ويستخدمه المعلم للدخول إلى منصته.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}


        {step === 3 && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pe-1">
            <Label>المواد والصفوف المسموح بها داخل المنصة</Label>
            <p className="text-xs text-muted-foreground">
              نفس نظام اختيار المواد المستخدم في تسجيل المعلمين.
            </p>
            <TeacherScopePicker
              scope={scope}
              subjects={subjects}
              onChange={(patch) => setScope((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        )}


        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>السابق</Button>}
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>التالي</Button>
          ) : (
            <Button disabled={!canNext || saving} onClick={submit}>
              {saving && <Loader2 className="h-4 w-4 animate-spin me-2" />} إنشاء المنصة
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagePlatformDialog({
  platform, subjects, onOpenChange, onSaved,
}: {
  platform: PlatformRow | null;
  subjects: SubjectOption[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [scope, setScope] = useState<TeacherFormData>(EMPTY_SCOPE);
  const [students, setStudents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const subjectIds = useMemo(() => resolveSubjectIds(scope, subjects), [scope, subjects]);

  useEffect(() => {
    if (!platform) return;
    setName(platform.name);
    setDescription(platform.description || "");
    setLogoUrl(platform.logo_url || "");
    setBrandColor(platform.brand_color || "#2563eb");
    setScope({ ...EMPTY_SCOPE, ...scopeFromSubjectIds(platform.subject_ids || [], subjects) });
    supabase.rpc("admin_list_platform_students", { _platform_id: platform.id })
      .then(({ data }) => setStudents((data as any[]) || []));
  }, [platform?.id, subjects]);

  const uploadLogo = async (file: File) => {
    if (!platform) return;
    if (!file.type.startsWith("image/")) return toast.error("اختر صورة صحيحة");
    if (file.size > 5 * 1024 * 1024) return toast.error("حجم الشعار يجب أن يكون أقل من 5 ميجابايت");
    setUploadingLogo(true);
    try {
      setLogoUrl(await uploadPlatformLogo(platform.id, file));
      toast.success("تم رفع الشعار — اضغط حفظ للتأكيد");
    } catch (e) {
      reportRpcError({
        title: "تعذر رفع الشعار",
        error: e,
        operation: "Storage teacher-profiles/platforms/branding",
        sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:625",
        context: { platform_id: platform.id, file_type: file.type, file_size: file.size },
      });
    } finally {
      setUploadingLogo(false);
    }
  };


  const save = async () => {
    if (!platform) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_teacher_platform", {
      _platform_id: platform.id,
      _name: name,
      _description: description || null,
      _logo_url: logoUrl || null,
      _brand_color: brandColor || null,
      _subject_ids: subjectIds,
    });
    setSaving(false);
    if (error) return reportRpcError({
      title: "تعذر حفظ تعديلات المنصة",
      error,
      operation: "RPC admin_update_teacher_platform",
      sourceHint: "src/pages/admin/AdminPlatformsPage.tsx:650",
      context: { platform_id: platform.id, subject_count: subjectIds.length },
    });
    toast.success("تم حفظ التعديلات");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={Boolean(platform)} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إدارة المنصة</DialogTitle>
          <DialogDescription>{platform ? platformFallbackUrl(platform.slug) : ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>اسم المنصة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>شعار المنصة</Label>
            <div className="flex items-center gap-3 mt-1">
              <div className="h-14 w-14 rounded-xl overflow-hidden border flex items-center justify-center shrink-0"
                style={{ background: brandColor }}>
                {logoUrl
                  ? <img src={logoUrl} alt="شعار المنصة" className="h-full w-full object-cover" />
                  : <Building2 className="h-5 w-5 text-white" />}
              </div>
              <div className="flex-1 space-y-2">
                <Input type="file" accept="image/*" disabled={uploadingLogo}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
                <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="رابط الشعار https://..." />
              </div>
            </div>
            {uploadingLogo && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> جارٍ رفع الشعار...
              </p>
            )}
          </div>
          <div>
            <Label>لون الهوية</Label>
            <Input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-10 w-24 p-1" />
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>المواد والصفوف</Label>
            <TeacherScopePicker
              scope={scope}
              subjects={subjects}
              onChange={(patch) => setScope((prev) => ({ ...prev, ...patch }))}
            />
          </div>

          <div>
            <Label>طلاب المنصة ({students.length})</Label>
            <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
              {students.map((s) => (
                <div key={s.user_id} className="p-2 text-sm">
                  <div className="font-medium">{s.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{s.email} · {s.student_code || ""}</div>
                </div>
              ))}
              {students.length === 0 && <p className="p-3 text-xs text-muted-foreground">لا يوجد طلاب بعد</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button disabled={saving} onClick={save}>
            {saving && <Loader2 className="h-4 w-4 animate-spin me-2" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
