import AuthenticatedVideo from "@/components/media/AuthenticatedVideo";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Send,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getTeacherProfileUploadErrorMessage, uploadTeacherProfileFile, type TeacherVideoUploadProgress } from "@/lib/teacherProfileUpload";
import { appendImageCacheBuster, saveTeacherAccountAvatar, setTeacherProfileAvatarCache } from "@/lib/teacherAvatar";
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

const C = {
  primary: "#2563EB",
  accent: "#7C3AED",
  bg: "#F8FAFC",
  border: "#E5E7EB",
  text: "#111827",
  muted: "#6B7280",
};

interface Schedule { id: string; day_of_week: string; time_slot: string }

export default function TeacherProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<TeacherVideoUploadProgress | null>(null);

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
      const publicUrl = await uploadTeacherProfileFile(file, user.id, "photo");
      const cacheBusted = appendImageCacheBuster(publicUrl);
      const updatedAt = await saveTeacherAccountAvatar(user.id, cacheBusted);
      setPhotoUrl(cacheBusted);
      setTeacherProfileAvatarCache(queryClient, user.id, cacheBusted, updatedAt);
      await queryClient.invalidateQueries({ queryKey: ["teacher-profile", user.id], refetchType: "all" });
      toast.success("تم رفع الصورة");
    } catch (error) {
      console.error("Teacher profile photo upload failed", error);
      toast.error(getTeacherProfileUploadErrorMessage(error, "فشل رفع الصورة"));
    } finally {
      setUploadingPhoto(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("video/")) { toast.error("يرجى اختيار فيديو"); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error("الحد الأقصى 100 ميجابايت"); return; }
    setUploadingVideo(true);
    setVideoUploadProgress(null);
    try {
      const publicUrl = await uploadTeacherProfileFile(file, user.id, "video", undefined, setVideoUploadProgress);
      setVideoUrl(publicUrl);
      toast.success("تم رفع الفيديو");
    } catch (error) {
      console.error("Teacher profile video upload failed", error);
      toast.error(getTeacherProfileUploadErrorMessage(error, "فشل رفع الفيديو"));
    } finally {
      setUploadingVideo(false);
      if (e.target) e.target.value = "";
    }
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
      <div dir="rtl" style={{ background: C.bg }} className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: C.primary }} />
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ background: C.bg, color: C.text }} className="min-h-screen pb-10">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-white/90 backdrop-blur"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="رجوع"
            className="h-9 w-9 rounded-full bg-white flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${C.border}` }}
          >
            <ArrowRight className="h-4 w-4" style={{ color: C.text }} />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold leading-tight" style={{ color: C.text }}>
              إنشاء ملف المعلم
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
              أكمل بياناتك التي ستظهر للطلاب.
            </p>
          </div>
          <div className="w-9 h-9 shrink-0" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {profileExists && !isApproved && (
          <div
            className="rounded-2xl px-4 py-3 text-xs flex items-center gap-2"
            style={{ background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E" }}
          >
            <Clock className="h-4 w-4 shrink-0" />
            ملفك قيد المراجعة من قِبل الإدارة، ولن يظهر للطلاب حتى الموافقة عليه.
          </div>
        )}
        {profileExists && isApproved && (
          <div
            className="rounded-2xl px-4 py-3 text-xs flex items-center gap-2"
            style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46" }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            ملفك معتمد ويظهر للطلاب. أي تعديل سيعيد الملف إلى قائمة المراجعة.
          </div>
        )}

        {/* FORM CARD */}
        <section
          className="rounded-3xl bg-white p-5 space-y-6"
          style={{ border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}
        >
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div
                className="h-28 w-28 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center"
                style={{ border: `1px solid ${C.border}` }}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold" style={{ color: C.muted }}>{initials}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="تغيير الصورة"
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-9 w-9 rounded-full flex items-center justify-center text-white shadow"
                style={{ background: C.primary }}
              >
                {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
            <p className="text-xs" style={{ color: C.muted }}>الصورة الشخصية تظهر للطلاب</p>
          </div>

          {/* Name */}
          <Field label="اسم المعلم" required>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="أ. محمد أحمد يوسف"
              className="h-11 bg-white"
              style={{ borderColor: C.border }}
            />
          </Field>

          {/* Experience */}
          <Field label="سنوات الخبرة" optional>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="5"
              className="h-11 bg-white"
              style={{ borderColor: C.border }}
            />
          </Field>

          {/* Schedules */}
          <Field label="موعد نزول الحصص" optional>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
              <Select value={newDay} onValueChange={setNewDay}>
                <SelectTrigger className="h-11 bg-white" style={{ borderColor: C.border }}>
                  <SelectValue placeholder="اليوم" />
                </SelectTrigger>
                <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newTime} onValueChange={setNewTime}>
                <SelectTrigger className="h-11 bg-white" style={{ borderColor: C.border }}>
                  <SelectValue placeholder="الوقت" />
                </SelectTrigger>
                <SelectContent>{TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Button
                type="button"
                onClick={addSchedule}
                className="h-11 gap-1 text-white sm:w-auto w-full"
                style={{ background: C.primary }}
              >
                <Plus className="h-4 w-4" />
                إضافة موعد
              </Button>
            </div>
            {schedules.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {schedules.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                    style={{ background: "#EFF6FF", color: C.primary, border: "1px solid #DBEAFE" }}
                  >
                    {s.day_of_week} — {s.time_slot}
                    <button
                      type="button"
                      onClick={() => removeSchedule(s.id)}
                      aria-label="حذف"
                      className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-white/60"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          {/* Bio */}
          <Field label="نبذة عن المعلم" required>
            <Textarea
              value={bio}
              maxLength={600}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              placeholder="اكتب نبذة مختصرة عن خبراتك وأسلوبك في التدريس..."
              className="resize-none bg-white"
              style={{ borderColor: C.border }}
            />
            <div className="text-[11px] mt-1 text-left" style={{ color: C.muted }}>{bio.length}/600</div>
          </Field>

          {/* Video */}
          <Field label="فيديو تعريفي" optional>
            {videoUrl ? (
              <div className="space-y-2">
                <AuthenticatedVideo source={videoUrl} className="w-full rounded-xl bg-black" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploadingVideo}
                  className="w-full h-10"
                  style={{ borderColor: C.border }}
                >
                  {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />}
                  تغيير الفيديو
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingVideo}
                className="w-full rounded-2xl px-4 py-6 text-center transition hover:bg-slate-50"
                style={{ border: `1.5px dashed ${C.border}`, background: "#FAFBFC" }}
              >
                <div className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: C.primary }}>
                  {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  رفع فيديو تعريفي
                </div>
                <p className="text-[11px] mt-1" style={{ color: C.muted }}>الحد الأقصى: 100 ميجابايت</p>
              </button>
            )}
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
            {uploadingVideo && videoUploadProgress && (
              <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-xs font-bold">
                  <span>{videoUploadProgress.phase === "finalizing" ? "جاري تجهيز الفيديو للتشغيل" : `رفع الجزء ${videoUploadProgress.currentPart} من ${videoUploadProgress.totalParts}`}</span>
                  <span className="text-primary">{videoUploadProgress.percent}%</span>
                </div>
                <Progress value={videoUploadProgress.percent} className="h-3" />
                <p className="text-[11px] text-muted-foreground">نسبة الجزء الحالي: {videoUploadProgress.partPercent}%</p>
              </div>
            )}
          </Field>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 rounded-2xl text-white text-sm font-bold gap-2"
            style={{ background: C.primary }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال السيرة للمراجعة
          </Button>
        </section>

        {/* PREVIEW */}
        <div>
          <h2 className="text-sm font-bold mb-2" style={{ color: C.text }}>معاينة ما سيراه الطالب</h2>
          <div
            className="rounded-3xl bg-white overflow-hidden"
            style={{ border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}
          >
            <div className="p-5 flex flex-col items-center text-center">
              <div
                className="h-20 w-20 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center"
                style={{ border: `2px solid ${C.border}` }}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-bold" style={{ color: C.muted }}>{initials}</span>
                )}
              </div>
              <h3 className="mt-3 text-base font-bold" style={{ color: C.text }}>
                {fullName || "اسم المعلم"}
              </h3>
              <span
                className="mt-1.5 inline-block text-[11px] px-2.5 py-0.5 rounded-full"
                style={{ background: "#EFF6FF", color: C.primary }}
              >
                معلم
              </span>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {experienceYears && (
                <PreviewRow title="سنوات الخبرة" value={`${experienceYears} سنوات`} />
              )}
              {schedules.length > 0 && (
                <PreviewRow
                  title="مواعيد نزول الحصص"
                  value={
                    <div className="flex flex-col gap-0.5">
                      {schedules.map((s) => (
                        <span key={s.id}>{s.day_of_week} — {s.time_slot}</span>
                      ))}
                    </div>
                  }
                />
              )}
              {bio && (
                <PreviewRow
                  title="نبذة المعلم"
                  value={<p className="leading-relaxed whitespace-pre-wrap">{bio}</p>}
                />
              )}
              {videoUrl && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: C.muted }}>الفيديو التعريفي</p>
                  <video src={resolveBunnyStorageUrl(videoUrl)} controls className="w-full rounded-xl bg-black" />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label, required, optional, children,
}: { label: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold flex items-center gap-1" style={{ color: C.text }}>
        {label}
        {required && <span style={{ color: "#EF4444" }}>*</span>}
        {optional && <span className="text-[11px] font-normal" style={{ color: C.muted }}>(اختياري)</span>}
      </Label>
      {children}
    </div>
  );
}

function PreviewRow({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-3 text-xs"
      style={{ background: "#F8FAFC", border: `1px solid ${C.border}`, color: C.text }}
    >
      <p className="font-semibold mb-1" style={{ color: C.muted }}>{title}</p>
      <div style={{ color: C.text }}>{value}</div>
    </div>
  );
}
