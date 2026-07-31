import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AdRecord {
  id: string;
  title: string;
  short_description: string | null;
  full_content: string | null;
  cover_image_url: string | null;
  additional_images: string[] | null;
  video_url: string | null;
  link_type: "none" | "external" | "internal";
  external_url: string | null;
  internal_route: string | null;
  color: string | null;
  ad_type: "teachers" | "subjects" | "discounts" | "info" | "updates" | "general";
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  slide_duration_seconds: number;
  is_active: boolean;
  created_at: string;
}

export interface AdTarget {
  id: string;
  ad_id: string;
  target_type: "all" | "stage" | "grade" | "section" | "specific_students";
  stage: string | null;
  education_type: string | null;
  grade: string | null;
  section: string | null;
  student_ids: string[] | null;
}

export interface AdSettings {
  bundles_button_placement: "hidden" | "sidebar" | "ad_slider" | "homepage_banner";
  bundles_button_order: number;
  show_student_code_with_ads: boolean;
}

interface StudentProfile {
  stage: string | null;
  grade: string | null;
  section: string | null;
  education_type: string | null;
}

function adMatchesStudent(
  targets: AdTarget[],
  userId: string,
  profile: StudentProfile
): boolean {
  if (!targets || targets.length === 0) return true;
  const eduOk = (t: AdTarget) => !t.education_type || t.education_type === profile.education_type;
  return targets.some((t) => {
    if (t.target_type === "all") return eduOk(t);
    if (t.target_type === "specific_students") return (t.student_ids || []).includes(userId);
    if (t.target_type === "stage") {
      // A stage target without a stage value is invalid — never treat it as "everyone"
      if (!t.stage) return false;
      return t.stage === profile.stage && eduOk(t);
    }
    if (t.target_type === "grade") {
      if (!t.grade) return false;
      return (!t.stage || t.stage === profile.stage) && t.grade === profile.grade && eduOk(t);
    }
    if (t.target_type === "section") {
      if (!t.section) return false;
      return (!t.stage || t.stage === profile.stage) &&
        (!t.grade || t.grade === profile.grade) &&
        t.section === profile.section && eduOk(t);
    }
    return false;
  });
}


export function useStudentAds(profile: StudentProfile | null) {
  const { user } = useAuth();
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [settings, setSettings] = useState<AdSettings>({
    bundles_button_placement: "sidebar",
    bundles_button_order: 0,
    show_student_code_with_ads: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user || !profile) {
        setLoading(false);
        return;
      }
      const [{ data: adsData }, { data: targetsData }, { data: settingsData }] = await Promise.all([
        supabase.from("ads").select("*").eq("is_active", true).order("display_order", { ascending: true }),
        supabase.from("ad_targets_safe" as any).select("*"),
        supabase.from("ad_settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      if (cancelled) return;

      const now = Date.now();
      const targetsByAd = new Map<string, AdTarget[]>();
      (targetsData as AdTarget[] | null)?.forEach((t) => {
        const arr = targetsByAd.get(t.ad_id) || [];
        arr.push(t);
        targetsByAd.set(t.ad_id, arr);
      });

      const filtered = ((adsData as AdRecord[] | null) || [])
        .filter((a) => {
          if (a.start_date && new Date(a.start_date).getTime() > now) return false;
          if (a.end_date && new Date(a.end_date).getTime() < now) return false;
          const targets = targetsByAd.get(a.id) || [];
          return adMatchesStudent(targets, user.id, profile);
        });

      setAds(filtered);
      if (settingsData) {
        setSettings({
          bundles_button_placement: (settingsData as any).bundles_button_placement || "sidebar",
          bundles_button_order: (settingsData as any).bundles_button_order || 0,
          show_student_code_with_ads: !!(settingsData as any).show_student_code_with_ads,
        });
      }
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel("ads-student-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_targets" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, profile?.stage, profile?.grade, profile?.section, profile?.education_type]);

  return { ads, settings, loading };
}

export async function recordAdView(adId: string, userId: string, clicked: boolean) {
  try {
    await supabase.from("ad_views").insert({
      ad_id: adId,
      student_id: userId,
      clicked,
      clicked_at: clicked ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error("recordAdView failed", e);
  }
}
