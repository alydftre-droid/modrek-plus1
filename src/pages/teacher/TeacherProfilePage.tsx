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
  ChevronDown,
  Clock,
  FileText,
  Plus,
  Quote,
  Save,
  Trash2,
  Upload,
  User,
  UserCircle2,
  Video as VideoIcon,
  Loader2,
  Bold,
  Italic,
  Underline,
  List,
  Link as LinkIcon,
  MoreVertical,
  Play,
} from "lucide-react";

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

  const handleSave = async () => {
    if (!user) return;
    if (!fullName.trim()) { toast.error("يرجى إدخال اسم المعلم"); return; }
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
      toast.success("تم حفظ الملف وإرساله للمراجعة");
    } catch (e) {
      console.error(e);
      toast.error("فشل الحفظ");
    } finally { setSaving(false); }
  };

  const initials = useMemo(
    () => fullName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("") || "؟",
    [fullName],
  );

  const scheduleDays = useMemo(() => [...new Set(schedules.map((s) => s.day_of_week))].join(" - "), [schedules]);
  const scheduleTime = schedules[0]?.time_slot || "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0a24]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen text-white"
      style={{ background: "radial-gradient(1200px 700px at 80% -10%, #2a1e5e 0%, #18102e 45%, #0d0820 100%)" }}
    >
      {/* Header */}
      <header className="max-w-[1400px] mx-auto px-4 md:px-8 pt-6 pb-4 flex items-center justify-between gap-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-md transition"
        >
          <ArrowRight className="h-4 w-4" />
          العودة
        </button>
        <div className="flex items-center gap-3 text-right">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold">إنشاء ملف المعلم</h1>
            <p className="text-xs md:text-sm text-white/60 mt-0.5">املأ المعلومات التالية التي ستظهر للطلاب في المنصة</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-violet-500/90 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <UserCircle2 className="h-6 w-6" />
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 pb-12">
        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          {/* FORM PANEL */}
          <section className="rounded-3xl bg-[#1a1238]/70 border border-white/5 p-5 md:p-7 shadow-2xl backdrop-blur-sm">
            <div className="text-right mb-6">
              <h2 className="text-xl font-bold">معلوماتك الأساسية</h2>
              <p className="text-sm text-white/55 mt-1">املأ البيانات التي ستظهر للطلاب عند اختيارك كمعلم</p>
            </div>

            <div className="rounded-2xl bg-[#100828]/60 border border-white/5 p-4 md:p-6 space-y-6">
              <FieldRow icon={<User className="h-5 w-5" />} label="اسم المعلم" required helper="اكتب اسمك كما تريد أن يظهر للطلاب">
                <DarkInput value={fullName} onChange={setFullName} placeholder="مثال: أ. محمد أحمد" />
              </FieldRow>

              <FieldRow icon={<Briefcase className="h-5 w-5" />} label="سنوات الخبرة" optional helper="اكتب عدد سنوات خبرتك في التدريس">
                <DarkInput value={experienceYears} onChange={setExperienceYears} placeholder="مثال: 5 سنوات" type="number" />
              </FieldRow>

              <FieldRow icon={<Calendar className="h-5 w-5" />} label="موعد نزول الحصص" optional helper="حدد الأيام والأوقات التي تنزل فيها الحصص">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                  <DarkSelect value={newDay} onChange={setNewDay} placeholder="اختر اليوم" options={DAYS} icon={<Calendar className="h-4 w-4" />} />
                  <DarkSelect value={newTime} onChange={setNewTime} placeholder="اختر الوقت" options={TIMES} icon={<Clock className="h-4 w-4" />} label="الوقت" />
                  <button
                    onClick={addSchedule}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/50 bg-violet-500/10 hover:bg-violet-500/20 px-4 h-12 text-sm font-semibold text-violet-200 transition"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة موعد
                  </button>
                </div>
                {schedules.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {schedules.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-2 text-sm">
                        <span className="text-white/80">{s.day_of_week} — {s.time_slot}</span>
                        <button onClick={() => removeSchedule(s.id)} className="text-red-300 hover:text-red-200">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </FieldRow>

              <FieldRow icon={<FileText className="h-5 w-5" />} label="نبذة عنك" required helper="اكتب نبذة مختصرة عن خبراتك ومعلوماتك للطلاب">
                <div className="rounded-xl border border-white/10 bg-[#1a1238] overflow-hidden">
                  <div className="flex items-center justify-end gap-1 px-3 py-2 border-b border-white/10 text-white/60">
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><MoreVertical className="h-4 w-4" /></button>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><List className="h-4 w-4" /></button>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><LinkIcon className="h-4 w-4" /></button>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><Quote className="h-4 w-4" /></button>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><Italic className="h-4 w-4" /></button>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><Underline className="h-4 w-4" /></button>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5"><Bold className="h-4 w-4" /></button>
                  </div>
                  <textarea
                    value={bio}
                    maxLength={600}
                    onChange={(e) => setBio(e.target.value)}
                    rows={5}
                    placeholder="اكتب هنا نبذة تعريفية عن نفسك، خبراتك، تخصصك، أسلوبك في التدريس، ما يميزك..."
                    className="w-full bg-transparent px-4 py-3 text-sm placeholder:text-white/30 outline-none resize-none"
                  />
                  <div className="px-4 pb-2 text-xs text-white/40">{bio.length}/600 حرف</div>
                </div>
              </FieldRow>

              <FieldRow icon={<VideoIcon className="h-5 w-5" />} label="فيديو تعريفي" optional helper="أضف فيديو تعريفي قصير عنك">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-violet-400/40 bg-violet-500/5 hover:bg-violet-500/10 px-6 py-7 text-center transition"
                >
                  <div className="flex items-center justify-center gap-2 text-violet-200 font-semibold text-sm">
                    {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {videoUrl ? "تغيير الفيديو التعريفي" : "رفع فيديو تعريفي"}
                  </div>
                  <p className="text-xs text-white/40 mt-1.5">أو اسحب وأفلت</p>
                  <p className="text-xs text-white/40 mt-0.5">الحد الأقصى: 100 ميجابايت</p>
                </button>
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              </FieldRow>
            </div>

            <div className="mt-6 flex justify-start">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-60 px-6 h-12 text-sm font-bold shadow-lg shadow-violet-500/30 transition"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ الملف
              </button>
            </div>
          </section>

          {/* PREVIEW PANEL */}
          <aside className="rounded-3xl bg-white/95 text-slate-800 p-5 md:p-6 shadow-2xl h-fit lg:sticky lg:top-6">
            <div className="text-right mb-4">
              <h2 className="text-lg font-bold text-slate-900">معاينة الملف</h2>
              <p className="text-xs text-slate-500 mt-0.5">هذا هو الشكل الذي سيراه الطلاب</p>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 h-40">
              <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 400 160" preserveAspectRatio="none">
                <path d="M0,90 C100,40 220,140 400,70 L400,160 L0,160 Z" fill="rgba(255,255,255,0.15)" />
                <path d="M0,120 C120,80 250,150 400,100 L400,160 L0,160 Z" fill="rgba(255,255,255,0.1)" />
              </svg>
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-12">
                <div className="relative">
                  <div className="h-28 w-28 rounded-full bg-slate-200 border-4 border-white overflow-hidden shadow-xl">
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-slate-500">{initials}</div>
                    )}
                  </div>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-violet-500 hover:bg-violet-600 flex items-center justify-center shadow-lg border-2 border-white"
                  >
                    {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <Camera className="h-3.5 w-3.5 text-white" />}
                  </button>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </div>
              </div>
            </div>

            <div className="mt-16 text-center">
              <h3 className="text-xl font-extrabold text-slate-900">{fullName || "اسم المعلم"}</h3>
              <span className="inline-block mt-2 px-3 py-1 rounded-md bg-violet-100 text-violet-700 text-xs font-semibold">معلم</span>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <PreviewRow icon={<Briefcase className="h-4 w-4 text-violet-500" />} label="سنوات الخبرة" value={experienceYears ? `${experienceYears} سنوات` : "—"} />
              <PreviewRow
                icon={<Calendar className="h-4 w-4 text-violet-500" />}
                label="موعد نزول الحصص"
                value={schedules.length ? scheduleDays : "—"}
                sub={scheduleTime}
              />
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center justify-between">
                <span>نبذة عن المعلم</span>
                <Quote className="h-4 w-4 text-violet-400" />
              </h4>
              <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                {bio || "ستظهر النبذة هنا بعد إدخالها"}
              </p>
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-bold text-slate-900 mb-2">الفيديو التعريفي</h4>
              <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video">
                {videoUrl ? (
                  <video src={videoUrl} controls className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-14 w-14 rounded-full bg-violet-500/90 flex items-center justify-center shadow-lg">
                      <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                    <span className="absolute bottom-2 left-2 text-xs text-white/80 bg-black/50 px-1.5 py-0.5 rounded">00:00</span>
                  </div>
                )}
              </div>
            </div>
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
    <div className="grid grid-cols-[auto_1fr] gap-4">
      <div className="h-10 w-10 rounded-xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center text-violet-300">
        {icon}
      </div>
      <div>
        <div className="flex items-center gap-2 text-right">
          <h3 className="text-sm font-bold text-white">
            {label} {required && <span className="text-red-400">*</span>}
            {optional && <span className="text-violet-300 text-xs font-normal mr-1">( اختياري )</span>}
          </h3>
        </div>
        {helper && <p className="text-xs text-white/45 mt-1 mb-2.5">{helper}</p>}
        {children}
      </div>
    </div>
  );
}

function DarkInput({
  value, onChange, placeholder, type = "text",
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-12 rounded-xl bg-[#1a1238] border border-white/10 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-400/60 transition"
    />
  );
}

function DarkSelect({
  value, onChange, placeholder, options, icon, label,
}: { value: string; onChange: (v: string) => void; placeholder: string; options: string[]; icon: React.ReactNode; label?: string }) {
  return (
    <div className="relative">
      {label && <span className="absolute -top-5 left-0 text-xs text-white/60">{label}</span>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-12 appearance-none rounded-xl bg-[#1a1238] border border-white/10 pr-10 pl-10 text-sm text-white outline-none focus:border-violet-400/60 transition text-right"
        >
          <option value="" className="bg-[#1a1238]">{placeholder}</option>
          {options.map((o) => <option key={o} value={o} className="bg-[#1a1238]">{o}</option>)}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">{icon}</span>
        <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
      </div>
    </div>
  );
}

function PreviewRow({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0">
      <div className="text-right">
        <p className="font-bold text-slate-700 text-sm">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <span>{label}</span>
        {icon}
      </div>
    </div>
  );
}
