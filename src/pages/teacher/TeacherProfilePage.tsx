import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  Camera,
  Clock,
  FileText,
  Plus,
  Quote,
  Send,
  Trash2,
  Upload,
  User,
  Video as VideoIcon,
  Loader2,
  Play,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const TIMES = [
  "8:00 صباحاً", "10:00 صباحاً", "12:00 ظهراً",
  "2:00 مساءً", "4:00 مساءً", "6:00 مساءً", "8:00 مساءً",
];

interface Schedule { id: string; day_of_week: string; time_slot: string }

export default function TeacherProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [profileExists, setProfileExists] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [newDay, setNewDay] = useState("");
  const [newTime, setNewTime] = useState("");

  useEffect(() => { if (user) void load(); }, [user?.id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: prof }, { data: tp }, { data: sch }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_profiles").select("*").eq("teacher_id", user.id).maybeSingle(),
      supabase.from("teacher_schedules").select("*").eq("teacher_id", user.id).order("created_at"),
    ]);
    if (prof) setFullName(prof.full_name || "");
    if (tp) {
      setProfileExists(true);
      setIsApproved(!!tp.is_approved);
      setBio(tp.bio || "");
      setPhotoUrl(tp.photo_url || "");
      setVideoUrl(tp.video_url || "");
      setExperienceYears(tp.experience_years ? String(tp.experience_years) : "");
    }
    setSchedules(sch || []);
    setLoading(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار صورة"); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("teacher-profiles").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("teacher-profiles").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
      toast.success("تم رفع الصورة");
    } catch { toast.error("فشل رفع الصورة"); }
    finally { setUploadingPhoto(false); }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("video/")) { toast.error("يرجى اختيار فيديو"); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error("الحد الأقصى 100 ميجابايت"); return; }
    setUploadingVideo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/intro-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("teacher-profiles").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("teacher-profiles").getPublicUrl(path);
      setVideoUrl(data.publicUrl);
      toast.success("تم رفع الفيديو");
    } catch { toast.error("فشل رفع الفيديو"); }
    finally { setUploadingVideo(false); }
  };

  const addSchedule = async () => {
    if (!user || !newDay || !newTime) { toast.error("اختر اليوم والوقت"); return; }
    const { data, error } = await supabase
      .from("teacher_schedules")
      .insert({ teacher_id: user.id, day_of_week: newDay, time_slot: newTime })
      .select()
      .single();
    if (error) { toast.error("فشل إضافة الموعد"); return; }
    setSchedules((p) => [...p, data as Schedule]);
    setNewDay(""); setNewTime("");
  };

  const removeSchedule = async (id: string) => {
    await supabase.from("teacher_schedules").delete().eq("id", id);
    setSchedules((p) => p.filter((s) => s.id !== id));
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!fullName.trim()) { toast.error("يرجى إدخال اسم المعلم"); return; }
    if (!photoUrl) { toast.error("يرجى رفع صورة شخصية"); return; }
    if (!bio.trim()) { toast.error("يرجى كتابة نبذة عنك"); return; }
    setSaving(true);
    try {
      await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
      const payload = {
        teacher_id: user.id,
        bio: bio.trim(),
        photo_url: photoUrl || null,
        video_url: videoUrl || null,
        experience_years: Math.max(0, Number(experienceYears || 0)),
        is_approved: false,
        updated_at: new Date().toISOString(),
      };
      const { error } = profileExists
        ? await supabase.from("teacher_profiles").update(payload).eq("teacher_id", user.id)
        : await supabase.from("teacher_profiles").insert(payload);
      if (error) throw error;
      setProfileExists(true);
      setIsApproved(false);
      toast.success("تم إرسال السيرة الذاتية للمراجعة");
    } catch (e) {
      console.error(e);
      toast.error("فشل الإرسال");
    } finally { setSaving(false); }
  };

  const initials = useMemo(
    () => fullName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("") || "؟",
    [fullName],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-2">
            <ArrowRight className="h-4 w-4" />
            العودة
          </Button>
          <div className="flex items-center gap-3 text-right">
            <div>
              <h1 className="text-lg md:text-xl font-extrabold text-foreground">إنشاء ملف المعلم</h1>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                املأ المعلومات التي ستظهر للطلاب في المنصة
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <User className="h-5 w-5" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
        {profileExists && !isApproved && (
          <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            ملفك قيد المراجعة من قِبل الإدارة، ولن يظهر للطلاب حتى الموافقة عليه.
          </div>
        )}
        {profileExists && isApproved && (
          <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            ملفك مُعتمد ويظهر للطلاب. أي تعديل سيُعيد الملف إلى قائمة المراجعة.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          {/* FORM PANEL */}
          <Card className="border-border shadow-sm">
            <CardContent className="p-5 md:p-7 space-y-6">
              <div className="text-right">
                <h2 className="text-lg font-bold text-foreground">معلوماتك الأساسية</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  املأ البيانات التي ستظهر للطلاب عند اختيارك كمعلم
                </p>
              </div>

              {/* Name */}
              <FieldRow icon={<User className="h-5 w-5" />} label="اسم المعلم" required helper="اكتب اسمك كما تريد أن يظهر للطلاب">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="مثال: أ. محمد أحمد" className="h-11" />
              </FieldRow>

              {/* Experience */}
              <FieldRow icon={<Briefcase className="h-5 w-5" />} label="سنوات الخبرة" optional helper="اكتب عدد سنوات خبرتك في التدريس">
                <Input
                  type="number"
                  min={0}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  placeholder="مثال: 5"
                  className="h-11"
                />
              </FieldRow>

              {/* Schedules */}
              <FieldRow icon={<Calendar className="h-5 w-5" />} label="موعد نزول الحصص" optional helper="حدد الأيام والأوقات التي تنزل فيها الحصص">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                  <Select value={newDay} onValueChange={setNewDay}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="اختر اليوم" /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={newTime} onValueChange={setNewTime}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="اختر الوقت" /></SelectTrigger>
                    <SelectContent>
                      {TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={addSchedule} className="h-11 gap-2">
                    <Plus className="h-4 w-4" />
                    إضافة موعد
                  </Button>
                </div>
                {schedules.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {schedules.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg bg-muted/50 border border-border px-3 py-2 text-sm">
                        <span className="text-foreground">{s.day_of_week} — {s.time_slot}</span>
                        <button
                          type="button"
                          onClick={() => removeSchedule(s.id)}
                          className="text-destructive hover:opacity-80"
                          aria-label="حذف الموعد"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </FieldRow>

              {/* Bio */}
              <FieldRow icon={<FileText className="h-5 w-5" />} label="نبذة عنك" required helper="اكتب نبذة مختصرة عن خبراتك ومعلوماتك للطلاب">
                <Textarea
                  value={bio}
                  maxLength={600}
                  onChange={(e) => setBio(e.target.value)}
                  rows={5}
                  placeholder="اكتب هنا نبذة تعريفية عن نفسك، خبراتك، تخصصك، أسلوبك في التدريس، ما يميزك..."
                  className="resize-none"
                />
                <div className="text-xs text-muted-foreground mt-1.5 text-left">{bio.length}/600 حرف</div>
              </FieldRow>

              {/* Photo */}
              <FieldRow icon={<Camera className="h-5 w-5" />} label="الصورة الشخصية" required helper="ستظهر للطلاب في ملفك">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 px-6 py-5 text-center transition"
                >
                  <div className="flex items-center justify-center gap-2 text-primary font-semibold text-sm">
                    {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {photoUrl ? "تغيير الصورة الشخصية" : "رفع صورة شخصية"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">JPG / PNG حتى 5 ميجابايت</p>
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </FieldRow>

              {/* Video */}
              <FieldRow icon={<VideoIcon className="h-5 w-5" />} label="فيديو تعريفي" optional helper="أضف فيديو تعريفي قصير عنك">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 px-6 py-6 text-center transition"
                >
                  <div className="flex items-center justify-center gap-2 text-primary font-semibold text-sm">
                    {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {videoUrl ? "تغيير الفيديو التعريفي" : "رفع فيديو تعريفي"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">الحد الأقصى: 100 ميجابايت</p>
                </button>
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              </FieldRow>

              {/* Submit */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3 sm:justify-end">
                <Button onClick={handleSubmit} disabled={saving} size="lg" className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  إرسال السيرة الذاتية للمراجعة
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* PREVIEW PANEL */}
          <aside className="lg:sticky lg:top-24 h-fit">
            <div className="text-right mb-3">
              <h2 className="text-base font-bold text-foreground">معاينة الملف</h2>
              <p className="text-xs text-muted-foreground mt-0.5">هذا هو الشكل الذي سيراه الطلاب</p>
            </div>

            <Card className="overflow-hidden border-border shadow-sm">
              <div className="relative bg-gradient-to-br from-primary via-primary to-primary/70 h-32">
                <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 400 130" preserveAspectRatio="none">
                  <path d="M0,80 C100,30 220,120 400,60 L400,130 L0,130 Z" fill="rgba(255,255,255,0.25)" />
                </svg>
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-12">
                  <div className="h-24 w-24 rounded-full bg-muted border-4 border-card overflow-hidden shadow-lg">
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-muted-foreground">{initials}</div>
                    )}
                  </div>
                </div>
              </div>

              <CardContent className="pt-16 pb-5 px-5">
                <div className="text-center">
                  <h3 className="text-lg font-extrabold text-foreground">{fullName || "اسم المعلم"}</h3>
                  <Badge variant="secondary" className="mt-2 bg-primary/10 text-primary hover:bg-primary/10">معلم</Badge>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <PreviewRow
                    icon={<Briefcase className="h-4 w-4 text-primary" />}
                    label="سنوات الخبرة"
                    value={experienceYears ? `${experienceYears} سنوات` : "—"}
                  />
                  <PreviewRow
                    icon={<Calendar className="h-4 w-4 text-primary" />}
                    label="مواعيد الحصص"
                    value={schedules.length ? "" : "—"}
                    list={schedules.map((s) => `${s.day_of_week} • ${s.time_slot}`)}
                  />
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-bold text-foreground mb-2 flex items-center justify-between">
                    <span>نبذة عن المعلم</span>
                    <Quote className="h-4 w-4 text-primary/60" />
                  </h4>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap min-h-[3rem]">
                    {bio || "ستظهر النبذة هنا بعد إدخالها"}
                  </p>
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-bold text-foreground mb-2">الفيديو التعريفي</h4>
                  <div className="relative rounded-xl overflow-hidden bg-muted aspect-video">
                    {videoUrl ? (
                      <video src={videoUrl} controls className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-12 w-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                          <Play className="h-5 w-5 text-primary-foreground fill-current" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function FieldRow({
  icon, label, required, optional, helper, children,
}: {
  icon: React.ReactNode; label: string; required?: boolean; optional?: boolean;
  helper?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 md:gap-4">
      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-right">
          <Label className="text-sm font-bold text-foreground">
            {label} {required && <span className="text-destructive">*</span>}
            {optional && <span className="text-muted-foreground text-xs font-normal mr-1">( اختياري )</span>}
          </Label>
        </div>
        {helper && <p className="text-xs text-muted-foreground mt-1 mb-2.5">{helper}</p>}
        {children}
      </div>
    </div>
  );
}

function PreviewRow({
  icon, label, value, list,
}: { icon: React.ReactNode; label: string; value: string; list?: string[] }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
      <div className="text-right min-w-0">
        {value && <p className="font-bold text-foreground text-sm">{value}</p>}
        {list && list.length > 0 && (
          <ul className="space-y-0.5">
            {list.map((l, i) => <li key={i} className="text-xs text-muted-foreground">{l}</li>)}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 text-muted-foreground text-xs shrink-0">
        <span>{label}</span>
        {icon}
      </div>
    </div>
  );
}
