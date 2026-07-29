import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getTeacherProfileUploadErrorMessage, uploadTeacherProfileFile } from "@/lib/teacherProfileUpload";
import { useQueryClient } from "@tanstack/react-query";
import { appendImageCacheBuster, saveTeacherAccountAvatar, setTeacherProfileAvatarCache } from "@/lib/teacherAvatar";
import {
  Camera,
  FileText,
  Globe,
  GraduationCap,
  ImagePlus,
  Instagram,
  Layers3,
  Loader2,
  Save,
  Sparkles,
  Upload,
  User,
  Video,
  CheckCircle,
  Clock,
  Link as LinkIcon,
} from "lucide-react";

interface TeacherProfile {
  teacher_id: string;
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  is_approved: boolean | null;
  cover_image_url: string | null;
  professional_title: string | null;
  experience_years: number;
  qualifications: Array<{ title: string }> | null;
  achievements: Array<{ title: string }> | null;
  gallery_urls: string[] | null;
  contact_links: Record<string, string> | null;
}

const CONTACT_FIELDS = [
  { key: "facebook", label: "فيسبوك", icon: Globe },
  { key: "instagram", label: "إنستجرام", icon: Instagram },
  { key: "youtube", label: "يوتيوب", icon: Video },
  { key: "telegram", label: "تيليجرام", icon: LinkIcon },
] as const;

const TeacherProfileEditor = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [experienceYears, setExperienceYears] = useState("0");
  const [qualificationsText, setQualificationsText] = useState("");
  const [achievementsText, setAchievementsText] = useState("");
  const [galleryText, setGalleryText] = useState("");
  const [contactLinks, setContactLinks] = useState<Record<string, string>>({ facebook: "", instagram: "", youtube: "", telegram: "" });

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user?.id]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("teacher_profiles")
        .select("*")
        .eq("teacher_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setBio(data.bio || "");
        setPhotoUrl(data.photo_url || "");
        setVideoUrl(data.video_url || "");
        setCoverImageUrl(data.cover_image_url || "");
        setProfessionalTitle(data.professional_title || "");
        setExperienceYears(String(data.experience_years || 0));
        setQualificationsText(Array.isArray(data.qualifications) ? data.qualifications.map((item: any) => item?.title || "").filter(Boolean).join("\n") : "");
        setAchievementsText(Array.isArray(data.achievements) ? data.achievements.map((item: any) => item?.title || "").filter(Boolean).join("\n") : "");
        setGalleryText(Array.isArray(data.gallery_urls) ? data.gallery_urls.join("\n") : "");
        const links = (data.contact_links && typeof data.contact_links === "object") ? data.contact_links as Record<string, string> : {};
        setContactLinks({
          facebook: links.facebook || "",
          instagram: links.instagram || "",
          youtube: links.youtube || "",
          telegram: links.telegram || "",
        });
      }
    } catch (e) {
      console.error("Error fetching teacher profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار صورة غلاف");
      return;
    }

    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadTeacherProfileFile(file, user.id, "cover");
      setCoverImageUrl(publicUrl);
      toast.success("تم رفع صورة الغلاف بنجاح");
    } catch (e) {
      console.error("Error uploading cover:", e);
      toast.error(getTeacherProfileUploadErrorMessage(e, "خطأ في رفع صورة الغلاف"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة");
      return;
    }

    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadTeacherProfileFile(file, user.id, "photo");
      const cacheBusted = appendImageCacheBuster(publicUrl);
      const updatedAt = await saveTeacherAccountAvatar(user.id, cacheBusted);
      setPhotoUrl(cacheBusted);
      setTeacherProfileAvatarCache(queryClient, user.id, cacheBusted, updatedAt);
      await queryClient.invalidateQueries({ queryKey: ["teacher-profile", user.id], refetchType: "all" });
      toast.success("تم رفع الصورة بنجاح");
    } catch (e) {
      console.error("Error uploading photo:", e);
      toast.error(getTeacherProfileUploadErrorMessage(e, "خطأ في رفع الصورة"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("video/")) {
      toast.error("يرجى اختيار ملف فيديو");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("حجم الفيديو يجب أن يكون أقل من 100 ميجا");
      return;
    }

    setUploadingVideo(true);
    try {
      const publicUrl = await uploadTeacherProfileFile(file, user.id, "video");
      setVideoUrl(publicUrl);
      toast.success("تم رفع الفيديو بنجاح");
    } catch (e) {
      console.error("Error uploading video:", e);
      toast.error(getTeacherProfileUploadErrorMessage(e, "خطأ في رفع الفيديو"));
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!bio.trim()) {
      toast.error("يرجى كتابة نبذة تعريفية");
      return;
    }

    const normalizeLines = (value: string) => value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const qualifications = normalizeLines(qualificationsText).map((title) => ({ title }));
    const achievements = normalizeLines(achievementsText).map((title) => ({ title }));
    const galleryUrls = normalizeLines(galleryText);
    const safeContactLinks = Object.fromEntries(Object.entries(contactLinks).filter(([, value]) => value.trim()));

    setSaving(true);
    try {
      const profileData = {
        teacher_id: user.id,
        bio: bio.trim(),
        photo_url: photoUrl || null,
        video_url: videoUrl || null,
        cover_image_url: coverImageUrl || null,
        professional_title: professionalTitle.trim() || null,
        experience_years: Math.max(0, Number(experienceYears || 0)),
        qualifications,
        achievements,
        gallery_urls: galleryUrls,
        contact_links: safeContactLinks,
        is_approved: false, // Reset approval on edit
        updated_at: new Date().toISOString(),
      };

      if (profile) {
        const { error } = await supabase
          .from("teacher_profiles")
          .update(profileData)
          .eq("teacher_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("teacher_profiles")
          .insert(profileData);
        if (error) throw error;
      }

      toast.success("تم حفظ السيرة الذاتية وإرسالها للمراجعة");
      fetchProfile();
    } catch (e) {
      console.error("Error saving profile:", e);
      toast.error("خطأ في حفظ السيرة الذاتية");
    } finally {
      setSaving(false);
    }
  };

  const statsPreview = useMemo(() => ([
    { label: "سنوات الخبرة", value: Math.max(0, Number(experienceYears || 0)) },
    { label: "المؤهلات", value: qualificationsText.split("\n").filter((item) => item.trim()).length },
    { label: "الإنجازات", value: achievementsText.split("\n").filter((item) => item.trim()).length },
    { label: "المعرض", value: galleryText.split("\n").filter((item) => item.trim()).length },
  ]), [achievementsText, experienceYears, galleryText, qualificationsText]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const approvalStatus = profile?.is_approved;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {profile && (
        <Card className={`border-2 ${
          approvalStatus ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" :
          "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20"
        }`}>
          <CardContent className="p-4 flex items-center gap-3">
            {approvalStatus ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">تمت الموافقة على سيرتك الذاتية</p>
                  <p className="text-sm text-green-600/80 dark:text-green-400/80">سيرتك الذاتية ظاهرة للطلاب الآن</p>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">سيرتك الذاتية قيد المراجعة</p>
                  <p className="text-sm text-amber-600/80 dark:text-amber-400/80">سيتم مراجعتها من قبل الإدارة قبل نشرها للطلاب</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border border-border/60 shadow-none">
        <div className="relative h-52 overflow-hidden bg-muted">
          {coverImageUrl ? (
            <img src={coverImageUrl} alt="صورة الغلاف" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[linear-gradient(135deg,hsl(var(--teacher-home-hero-from)),hsl(var(--teacher-home-hero-to)))]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 flex items-end gap-4">
            <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
              <AvatarImage src={photoUrl} />
              <AvatarFallback className="bg-primary/10 text-primary">
                <User className="h-10 w-10" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pb-2">
              <p className="text-xs text-muted-foreground mb-1">معاينة بطاقة المعلم</p>
              <h3 className="text-2xl font-black text-foreground truncate">{professionalTitle.trim() || "أضف عنواناً مهنياً مميزاً"}</h3>
              <p className="text-sm text-muted-foreground truncate mt-1">{bio.trim() || "اكتب نبذة قصيرة توضح خبرتك ومنهجك في التدريس"}</p>
            </div>
          </div>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cover-upload" className="text-sm font-semibold flex items-center gap-2"><ImagePlus className="h-4 w-4" /> صورة الغلاف</Label>
              <Label htmlFor="cover-upload" className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-accent/30 text-sm font-semibold text-primary hover:bg-accent/50">
                {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {coverImageUrl ? "تغيير الغلاف" : "رفع صورة غلاف"}
              </Label>
              <Input id="cover-upload" type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo-upload" className="text-sm font-semibold flex items-center gap-2"><Camera className="h-4 w-4" /> الصورة الشخصية</Label>
              <Label htmlFor="photo-upload" className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-accent/30 text-sm font-semibold text-primary hover:bg-accent/50">
                {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {photoUrl ? "تغيير الصورة" : "رفع صورة شخصية"}
              </Label>
              <Input id="photo-upload" type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            الهوية المهنية
          </CardTitle>
          <CardDescription>أضف الانطباع الأول الذي سيشاهده الطالب عنك</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>العنوان المهني</Label>
              <Input value={professionalTitle} onChange={(e) => setProfessionalTitle(e.target.value)} placeholder="مثال: مدرس رياضيات ثانوي وخبير تبسيط المسائل" />
            </div>
            <div className="space-y-2">
              <Label>سنوات الخبرة</Label>
              <Input type="number" min={0} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {statsPreview.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                <p className="text-lg font-black text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            النبذة التعريفية
          </CardTitle>
          <CardDescription>اكتب نبذة عن نفسك وخبراتك التعليمية</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="اكتب نبذة تعريفية عنك... (مثال: خبرة 10 سنوات في تدريس المواد العربية، حاصل على ماجستير في النحو...)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2">{bio.length} / 1000 حرف</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> المؤهلات والخبرات</CardTitle>
          <CardDescription>اكتب كل بند في سطر مستقل</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>المؤهلات والشهادات</Label>
            <Textarea value={qualificationsText} onChange={(e) => setQualificationsText(e.target.value)} rows={6} placeholder="بكالوريوس ...&#10;دبلوم ...&#10;شهادة تدريب ..." className="bg-card" />
          </div>
          <div className="space-y-2">
            <Label>الإنجازات</Label>
            <Textarea value={achievementsText} onChange={(e) => setAchievementsText(e.target.value)} rows={6} placeholder="أعددت أكثر من ...&#10;ساهمت في ...&#10;نسبة نجاح ..." className="bg-card" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layers3 className="h-5 w-5" /> معرض الأعمال وروابط التواصل</CardTitle>
          <CardDescription>أضف روابط الصور وروابط التواصل التي تريد ظهورها للطلاب</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>روابط المعرض</Label>
            <Textarea value={galleryText} onChange={(e) => setGalleryText(e.target.value)} rows={5} placeholder="رابط صورة 1&#10;رابط صورة 2&#10;رابط صورة 3" className="bg-card" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {CONTACT_FIELDS.map(({ key, label, icon: Icon }) => (
              <div key={key} className="space-y-2">
                <Label className="flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</Label>
                <Input
                  value={contactLinks[key] || ""}
                  onChange={(e) => setContactLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`رابط ${label}`}
                  dir="ltr"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Intro Video */}
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              فيديو تعريفي
            </CardTitle>
            <CardDescription>ارفع فيديو تعريفي قصير يظهر للطلاب داخل السيرة الذاتية (اختياري)</CardDescription>
        </CardHeader>
        <CardContent>
          {videoUrl && (
            <div className="mb-4 rounded-lg overflow-hidden bg-black">
              <video
                src={videoUrl}
                controls
                className="w-full max-h-64 object-contain"
              />
            </div>
          )}
          <Label htmlFor="video-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors justify-center">
              {uploadingVideo ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Video className="h-5 w-5 text-primary" />
              )}
              <span className="text-sm font-medium">
                {uploadingVideo ? "جاري رفع الفيديو..." : videoUrl ? "تغيير الفيديو" : "رفع فيديو تعريفي"}
              </span>
            </div>
          </Label>
          <Input
            id="video-upload"
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="hidden"
          />
          <p className="text-xs text-muted-foreground mt-2">MP4, MOV, MKV, AVI, WEBM - حجم أقصى 100 ميجا</p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving || !bio.trim()}
        className="w-full gap-2"
        size="lg"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        حفظ وإرسال للمراجعة
      </Button>
    </div>
  );
};

export default TeacherProfileEditor;
