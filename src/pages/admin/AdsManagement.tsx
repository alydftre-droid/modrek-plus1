import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  ArrowRight, Plus, Edit, Trash2, Upload, X, Loader2, BarChart3,
  Eye, MousePointerClick, Megaphone, Image as ImageIcon, Settings as SettingsIcon
} from "lucide-react";

type LinkType = "none" | "external" | "internal";
type AdType = "teachers" | "subjects" | "discounts" | "info" | "updates" | "general";
type TargetType = "all" | "stage" | "grade" | "section" | "specific_students";
type BundlesPlacement = "hidden" | "sidebar" | "ad_slider" | "homepage_banner";

interface Ad {
  id: string;
  title: string;
  short_description: string | null;
  full_content: string | null;
  cover_image_url: string | null;
  additional_images: string[];
  video_url: string | null;
  link_type: LinkType;
  external_url: string | null;
  internal_route: string | null;
  color: string | null;
  ad_type: AdType;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  slide_duration_seconds: number;
  is_active: boolean;
}

interface Target {
  id?: string;
  target_type: TargetType;
  stage: string | null;
  education_type: string | null;
  grade: string | null;
  section: string | null;
  student_ids: string[];
}

const AD_TYPE_LABELS: Record<AdType, string> = {
  teachers: "إعلان معلمين",
  subjects: "إعلان مواد",
  discounts: "إعلان خصومات",
  info: "إعلان معلومات",
  updates: "إعلان تحديثات",
  general: "إعلان عام",
};

const emptyAd: Omit<Ad, "id"> = {
  title: "",
  short_description: "",
  full_content: "",
  cover_image_url: null,
  additional_images: [],
  video_url: null,
  link_type: "none",
  external_url: null,
  internal_route: null,
  color: "emerald",
  ad_type: "general",
  start_date: null,
  end_date: null,
  display_order: 0,
  slide_duration_seconds: 5,
  is_active: true,
};

export default function AdsManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [editorAd, setEditorAd] = useState<Omit<Ad, "id">>(emptyAd);
  const [target, setTarget] = useState<Target>({
    target_type: "all", stage: null, education_type: null, grade: null, section: null, student_ids: [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState<Record<string, { views: number; clicks: number }>>({});
  const [settings, setSettings] = useState<{ bundles_button_placement: BundlesPlacement }>({
    bundles_button_placement: "sidebar",
  });
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<{ id: string; full_name: string; student_code: string | null }[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: adsData }, { data: settingsData }, { data: viewsData }] = await Promise.all([
      supabase.from("ads").select("*").order("display_order", { ascending: true }),
      supabase.from("ad_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("ad_views").select("ad_id, student_id, clicked"),
    ]);
    setAds((adsData as Ad[]) || []);
    if (settingsData) setSettings({ bundles_button_placement: (settingsData as any).bundles_button_placement || "sidebar" });
    // Count UNIQUE students per ad (real audience), and unique clickers
    const viewers: Record<string, Set<string>> = {};
    const clickers: Record<string, Set<string>> = {};
    (viewsData || []).forEach((v: any) => {
      if (!v.ad_id || !v.student_id) return;
      (viewers[v.ad_id] ||= new Set()).add(v.student_id);
      if (v.clicked) (clickers[v.ad_id] ||= new Set()).add(v.student_id);
    });
    const map: Record<string, { views: number; clicks: number }> = {};
    Object.keys(viewers).forEach((id) => {
      map[id] = { views: viewers[id].size, clicks: clickers[id]?.size || 0 };
    });
    setStats(map);
    setLoading(false);
  };


  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setEditorAd(emptyAd);
    setTarget({ target_type: "all", stage: null, education_type: null, grade: null, section: null, student_ids: [] });
    setEditorOpen(true);
  };

  const openEdit = async (ad: Ad) => {
    setEditing(ad);
    setEditorAd({
      title: ad.title,
      short_description: ad.short_description,
      full_content: ad.full_content,
      cover_image_url: ad.cover_image_url,
      additional_images: ad.additional_images || [],
      video_url: ad.video_url,
      link_type: ad.link_type,
      external_url: ad.external_url,
      internal_route: ad.internal_route,
      color: ad.color,
      ad_type: ad.ad_type,
      start_date: ad.start_date,
      end_date: ad.end_date,
      display_order: ad.display_order,
      slide_duration_seconds: ad.slide_duration_seconds,
      is_active: ad.is_active,
    });
    const { data: targets } = await supabase.from("ad_targets").select("*").eq("ad_id", ad.id).maybeSingle();
    if (targets) {
      setTarget({
        id: (targets as any).id,
        target_type: (targets as any).target_type || "all",
        stage: (targets as any).stage,
        education_type: (targets as any).education_type,
        grade: (targets as any).grade,
        section: (targets as any).section,
        student_ids: (targets as any).student_ids || [],
      });
    } else {
      setTarget({ target_type: "all", stage: null, education_type: null, grade: null, section: null, student_ids: [] });
    }
    setEditorOpen(true);
  };

  const uploadFile = async (file: File, prefix: string): Promise<string | null> => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("ads-media").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("ads-media").getPublicUrl(path);
      return data.publicUrl;
    } catch (e: any) {
      toast({ title: "خطأ في الرفع", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const onCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "covers");
    if (url) setEditorAd((p) => ({ ...p, cover_image_url: url }));
  };

  const onAdditionalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const url = await uploadFile(f, "extras");
      if (url) setEditorAd((p) => ({ ...p, additional_images: [...p.additional_images, url] }));
    }
  };

  const onVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "videos");
    if (url) setEditorAd((p) => ({ ...p, video_url: url }));
  };

  const searchStudents = async (q: string) => {
    setStudentSearch(q);
    if (q.trim().length < 2) { setStudentResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, student_code")
      .or(`full_name.ilike.%${q}%,student_code.ilike.%${q}%`)
      .limit(10);
    setStudentResults((data as any) || []);
  };

  const save = async () => {
    if (!editorAd.title.trim()) {
      toast({ title: "اسم الإعلان مطلوب", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      let adId = editing?.id;
      const payload = { ...editorAd, created_by: user?.id };
      if (editing) {
        const { error } = await supabase.from("ads").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("ads").insert(payload).select("id").single();
        if (error) throw error;
        adId = (data as any).id;
      }
      if (adId) {
        const { error: delErr } = await supabase.from("ad_targets").delete().eq("ad_id", adId);
        if (delErr) throw delErr;
        const { id: _ignoredTargetId, ...targetPayload } = target as any;
        const { error: tErr } = await supabase.from("ad_targets").insert({ ad_id: adId, ...targetPayload });
        if (tErr) throw tErr;
      }

      toast({ title: editing ? "تم تحديث الإعلان" : "تم إنشاء الإعلان" });
      setEditorOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإعلان؟")) return;
    const { error } = await supabase.from("ads").delete().eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم الحذف" });
    load();
  };

  const toggleActive = async (ad: Ad) => {
    await supabase.from("ads").update({ is_active: !ad.is_active }).eq("id", ad.id);
    load();
  };

  const saveSettings = async () => {
    await supabase.from("ad_settings").update({
      bundles_button_placement: settings.bundles_button_placement,
      updated_by: user?.id,
    }).eq("id", 1);
    toast({ title: "تم حفظ الإعدادات" });
  };

  const totalViews = Object.values(stats).reduce((s, v) => s + v.views, 0);
  const totalClicks = Object.values(stats).reduce((s, v) => s + v.clicks, 0);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Clean header — aligned with platform palette */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-card/85 border-b border-border">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="rounded-full shrink-0 h-9 w-9">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] sm:text-lg font-bold text-foreground flex items-center gap-2 truncate">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-mudrik shrink-0">
                <Megaphone className="h-3.5 w-3.5 text-primary-foreground" />
              </span>
              <span className="truncate">مركز الإعلانات</span>
            </h1>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">إدارة محتوى السلايدر الذكي</p>
          </div>
        </div>
      </header>

      <div className="px-5 sm:px-8 py-5 max-w-5xl mx-auto space-y-5">
        {/* Prominent create button — Azhari green + gold accent */}
        <button
          type="button"
          onClick={openNew}
          className="group relative w-full overflow-hidden rounded-2xl px-5 py-4 text-right shadow-mudrik hover:shadow-lg active:scale-[0.99] transition-all"
          style={{ background: "linear-gradient(135deg, hsl(var(--mudrik-green-dark)) 0%, hsl(var(--mudrik-green)) 55%, hsl(var(--mudrik-green-light)) 100%)" }}
        >
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-[hsl(var(--gold)/0.25)] blur-2xl" />
          <div className="absolute -right-6 -bottom-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-primary-foreground text-[15px] font-extrabold leading-tight">إنشاء إعلان جديد</div>
              <div className="text-primary-foreground/85 text-[11px] font-medium mt-1 leading-tight">أضف شريحة جديدة لسلايدر الطلاب</div>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--gold))] shadow-gold shrink-0 group-hover:scale-105 transition-transform">
              <Plus className="h-5 w-5 text-[hsl(var(--mudrik-green-dark))]" strokeWidth={3} />
            </span>
          </div>
        </button>

        {/* Stat cards — semantic tokens */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-2xl bg-card border border-border p-3 shadow-sm">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
              <Megaphone className="h-3.5 w-3.5 text-accent-foreground" />
            </span>
            <p className="mt-2.5 text-[10px] font-medium text-muted-foreground leading-tight">إجمالي الإعلانات</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-0.5 tabular-nums">{ads.length}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-3 shadow-sm">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--mudrik-green-light)/0.18)]">
              <Eye className="h-3.5 w-3.5 text-primary" />
            </span>
            <p className="mt-2.5 text-[10px] font-medium text-muted-foreground leading-tight">مشاهدات فريدة</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-0.5 tabular-nums">{totalViews}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-3 shadow-sm">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--gold)/0.18)]">
              <MousePointerClick className="h-3.5 w-3.5 text-[hsl(var(--gold-dark))]" />
            </span>
            <p className="mt-2.5 text-[10px] font-medium text-muted-foreground leading-tight">نقرات فعلية</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-0.5 tabular-nums">{totalClicks}</p>
          </div>
        </div>

        {/* Bundles placement settings */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">إعدادات زر الباقات المخفضة</h2>
          </div>
          <div className="space-y-2.5">
            <div>
              <Label className="text-[11px] mb-1.5 block text-muted-foreground font-medium">مكان ظهور الزر</Label>
              <Select
                value={settings.bundles_button_placement}
                onValueChange={(v) => setSettings({ bundles_button_placement: v as BundlesPlacement })}
              >
                <SelectTrigger className="rounded-xl h-10 text-sm bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hidden">مخفي تماماً</SelectItem>
                  <SelectItem value="sidebar">الشريط الجانبي فقط</SelectItem>
                  <SelectItem value="ad_slider">داخل سلايدر الإعلانات</SelectItem>
                  <SelectItem value="homepage_banner">بانر في الصفحة الرئيسية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveSettings} className="w-full rounded-xl h-10 text-sm font-semibold">
              حفظ الإعدادات
            </Button>
          </div>
        </div>

        {/* Ads list */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-foreground">قائمة الإعلانات</h2>
            <span className="text-[11px] text-muted-foreground font-medium">{ads.length} إعلان</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : ads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent mb-3">
                <Megaphone className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground">لا توجد إعلانات بعد</p>
              <p className="text-xs text-muted-foreground mt-1">أنشئ أول إعلان ليظهر للطلاب فوراً</p>
            </div>
          ) : (
            ads.map((ad) => {
              const s = stats[ad.id] || { views: 0, clicks: 0 };
              const ctr = s.views > 0 ? Math.round((s.clicks / s.views) * 100) : 0;
              return (
                <div key={ad.id} className="rounded-2xl border border-border bg-card p-3 shadow-sm hover:border-primary/40 hover:shadow-mudrik transition-all">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted shrink-0">
                      {ad.cover_image_url ? (
                        <img src={ad.cover_image_url} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-[13px] text-foreground truncate">{ad.title}</p>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground font-medium">
                          {AD_TYPE_LABELS[ad.ad_type]}
                        </span>
                        {!ad.is_active && <span className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">معطل</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium">
                          <Eye className="h-3 w-3" />{s.views}
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <MousePointerClick className="h-3 w-3" />{s.clicks}
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <BarChart3 className="h-3 w-3" />{ctr}%
                        </span>
                        <span className="opacity-70">· ترتيب {ad.display_order}</span>
                      </div>
                    </div>
                    <Switch checked={ad.is_active} onCheckedChange={() => toggleActive(ad)} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(ad)} className="flex-1 h-8 rounded-lg text-primary hover:bg-accent text-xs font-semibold gap-1">
                      <Edit className="h-3.5 w-3.5" /> تعديل
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(ad.id)} className="flex-1 h-8 rounded-lg text-destructive hover:bg-destructive/10 text-xs font-semibold gap-1">
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>


      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الإعلان" : "إعلان جديد"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="content">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="content">المحتوى</TabsTrigger>
              <TabsTrigger value="media">الوسائط</TabsTrigger>
              <TabsTrigger value="link">الرابط</TabsTrigger>
              <TabsTrigger value="targeting">الاستهداف</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-3 pt-3">
              <div>
                <Label>عنوان الإعلان *</Label>
                <Input value={editorAd.title} onChange={(e) => setEditorAd({ ...editorAd, title: e.target.value })} />
              </div>
              <div>
                <Label>وصف مختصر</Label>
                <Input value={editorAd.short_description || ""} onChange={(e) => setEditorAd({ ...editorAd, short_description: e.target.value })} />
              </div>
              <div>
                <Label>المحتوى الكامل</Label>
                <Textarea rows={5} value={editorAd.full_content || ""} onChange={(e) => setEditorAd({ ...editorAd, full_content: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>نوع الإعلان</Label>
                  <Select value={editorAd.ad_type} onValueChange={(v: AdType) => setEditorAd({ ...editorAd, ad_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AD_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ترتيب الظهور</Label>
                  <Input type="number" value={editorAd.display_order} onChange={(e) => setEditorAd({ ...editorAd, display_order: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ البداية</Label>
                  <Input type="datetime-local" value={editorAd.start_date?.slice(0, 16) || ""} onChange={(e) => setEditorAd({ ...editorAd, start_date: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div>
                  <Label>تاريخ النهاية</Label>
                  <Input type="datetime-local" value={editorAd.end_date?.slice(0, 16) || ""} onChange={(e) => setEditorAd({ ...editorAd, end_date: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>مدة الشريحة (ثانية)</Label>
                  <Input type="number" value={editorAd.slide_duration_seconds} onChange={(e) => setEditorAd({ ...editorAd, slide_duration_seconds: Number(e.target.value) || 5 })} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2">
                    <Switch checked={editorAd.is_active} onCheckedChange={(v) => setEditorAd({ ...editorAd, is_active: v })} />
                    <span className="text-sm">مفعل</span>
                  </label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="media" className="space-y-3 pt-3">
              <div>
                <Label>صورة الغلاف</Label>
                <div className="flex items-center gap-2 mt-1">
                  {editorAd.cover_image_url && (
                    <img src={editorAd.cover_image_url} className="h-20 w-32 object-cover rounded-lg border" />
                  )}
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={onCoverUpload} />
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-card hover:bg-accent text-sm">
                      <Upload className="h-4 w-4" /> رفع صورة
                    </div>
                  </label>
                </div>
              </div>
              <div>
                <Label>صور إضافية</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {editorAd.additional_images.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} className="h-16 w-16 object-cover rounded border" />
                      <button onClick={() => setEditorAd({ ...editorAd, additional_images: editorAd.additional_images.filter((_, idx) => idx !== i) })}
                        className="absolute -top-1 -left-1 h-5 w-5 bg-destructive text-white rounded-full flex items-center justify-center">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={onAdditionalUpload} />
                    <div className="h-16 w-16 rounded border-2 border-dashed flex items-center justify-center hover:bg-accent">
                      <Plus className="h-5 w-5" />
                    </div>
                  </label>
                </div>
              </div>
              <div>
                <Label>فيديو (اختياري)</Label>
                <div className="flex items-center gap-2 mt-1">
                  {editorAd.video_url && (
                    <span className="text-xs text-muted-foreground truncate flex-1">{editorAd.video_url}</span>
                  )}
                  <label className="cursor-pointer">
                    <input type="file" accept="video/*" className="hidden" onChange={onVideoUpload} />
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-card hover:bg-accent text-sm">
                      <Upload className="h-4 w-4" /> رفع فيديو
                    </div>
                  </label>
                  {editorAd.video_url && (
                    <Button variant="ghost" size="icon" onClick={() => setEditorAd({ ...editorAd, video_url: null })}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {uploading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> جاري الرفع...</p>}
            </TabsContent>

            <TabsContent value="link" className="space-y-3 pt-3">
              <div>
                <Label>نوع الرابط</Label>
                <Select value={editorAd.link_type} onValueChange={(v: LinkType) => setEditorAd({ ...editorAd, link_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون رابط (يفتح صفحة التفاصيل)</SelectItem>
                    <SelectItem value="external">رابط خارجي</SelectItem>
                    <SelectItem value="internal">صفحة داخلية في المنصة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editorAd.link_type === "external" && (
                <div>
                  <Label>الرابط الخارجي</Label>
                  <Input type="url" placeholder="https://..." value={editorAd.external_url || ""} onChange={(e) => setEditorAd({ ...editorAd, external_url: e.target.value })} />
                </div>
              )}
              {editorAd.link_type === "internal" && (
                <div>
                  <Label>المسار الداخلي</Label>
                  <Input placeholder="/student/bundles" value={editorAd.internal_route || ""} onChange={(e) => setEditorAd({ ...editorAd, internal_route: e.target.value })} />
                  <p className="text-[11px] text-muted-foreground mt-1">مثال: /student/bundles أو /my-courses</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="targeting" className="space-y-3 pt-3">
              <div>
                <Label>الجمهور المستهدف</Label>
                <Select value={target.target_type} onValueChange={(v: TargetType) => setTarget({ ...target, target_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الطلاب</SelectItem>
                    <SelectItem value="stage">مرحلة معينة</SelectItem>
                    <SelectItem value="grade">صف معين</SelectItem>
                    <SelectItem value="section">شعبة معينة</SelectItem>
                    <SelectItem value="specific_students">طلاب محددون</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {target.target_type !== "all" && target.target_type !== "specific_students" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>المرحلة</Label>
                      <Select value={target.stage || "any"} onValueChange={(v) => setTarget({ ...target, stage: v === "any" ? null : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">أي مرحلة</SelectItem>
                          <SelectItem value="preparatory">إعدادي</SelectItem>
                          <SelectItem value="secondary">ثانوي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>نوع التعليم</Label>
                      <Select value={target.education_type || "any"} onValueChange={(v) => setTarget({ ...target, education_type: v === "any" ? null : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">أي نوع</SelectItem>
                          <SelectItem value="عام">عام</SelectItem>
                          <SelectItem value="أزهر">أزهر</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(target.target_type === "grade" || target.target_type === "section") && (
                    <div>
                      <Label>الصف</Label>
                      <Select value={target.grade || "any"} onValueChange={(v) => setTarget({ ...target, grade: v === "any" ? null : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">أي صف</SelectItem>
                          <SelectItem value="first">الأول</SelectItem>
                          <SelectItem value="second">الثاني</SelectItem>
                          <SelectItem value="third">الثالث</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {target.target_type === "section" && (
                    <div>
                      <Label>الشعبة</Label>
                      <Input placeholder="مثال: علمي، أدبي، علمي علوم..." value={target.section || ""} onChange={(e) => setTarget({ ...target, section: e.target.value || null })} />
                    </div>
                  )}
                </>
              )}
              {target.target_type === "specific_students" && (
                <div className="space-y-2">
                  <Label>بحث عن طلاب (بالاسم أو كود الطالب)</Label>
                  <Input value={studentSearch} onChange={(e) => searchStudents(e.target.value)} placeholder="اكتب للبحث..." />
                  {studentResults.length > 0 && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {studentResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (!target.student_ids.includes(s.id)) {
                              setTarget({ ...target, student_ids: [...target.student_ids, s.id] });
                            }
                          }}
                          className="w-full px-3 py-2 text-right hover:bg-accent text-sm border-b last:border-b-0"
                        >
                          {s.full_name} <span className="text-muted-foreground text-xs">({s.student_code || "—"})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">المحددون: {target.student_ids.length}</p>
                  {target.student_ids.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setTarget({ ...target, student_ids: [] })}>مسح القائمة</Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              {editing ? "حفظ التعديلات" : "إنشاء الإعلان"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
