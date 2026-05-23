import { supabase } from "@/integrations/supabase/client";

export type EducationType = "عام" | "أزهر";
export type BundleStatus = "draft" | "scheduled" | "active" | "hidden" | "expired";

export interface BundledPackage {
  id: string;
  created_by: string;
  name: string | null;
  description: string | null;
  image_url: string | null;
  color: string | null;
  education_type: EducationType;
  stage: "preparatory" | "secondary";
  grade: string;
  section: string | null;
  discount_percentage: number;
  manual_final_price: number | null;
  status: BundleStatus;
  publish_at: string | null;
  expires_at: string | null;
  max_subscriptions: number | null;
  subscriptions_count: number;
  created_at: string;
  updated_at: string;
}

export interface BundlePrice {
  original: number;
  final: number;
  discount_amount: number;
  discount_percentage: number;
}

export async function computeBundlePrice(packageId: string): Promise<BundlePrice> {
  const { data, error } = await supabase.rpc("compute_bundle_price" as any, { _package_id: packageId });
  if (error) throw error;
  return data as BundlePrice;
}

export const GRADES_BY_STAGE: Record<"preparatory" | "secondary", string[]> = {
  preparatory: ["الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي"],
  secondary: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"],
};

/** Returns whether a (eduType, grade) needs a section selection from the admin. */
export function gradeNeedsSection(eduType: EducationType, grade: string): boolean {
  if (eduType === "أزهر") {
    return grade.includes("ثانوي");
  }
  // عام
  return grade.includes("الثاني الثانوي") || grade.includes("الثالث الثانوي");
}

export function sectionsForGrade(eduType: EducationType, grade: string): { value: string; label: string }[] {
  if (!gradeNeedsSection(eduType, grade)) return [];
  if (eduType === "أزهر") {
    return [
      { value: "scientific", label: "علمي" },
      { value: "literary", label: "أدبي" },
    ];
  }
  if (grade.includes("الثالث الثانوي")) {
    return [
      { value: "science_track", label: "علمي علوم" },
      { value: "math_track", label: "علمي رياضة" },
      { value: "literary", label: "أدبي" },
    ];
  }
  // الثاني الثانوي عام
  return [
    { value: "scientific", label: "علمي" },
    { value: "literary", label: "أدبي" },
  ];
}
