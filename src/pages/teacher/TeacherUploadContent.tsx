import { useEffect, useMemo, useState } from "react";
import { isBunnyVideo, getBunnyThumbnailUrl, extractBunnyVideoId } from "@/lib/bunnyStream";
import VideoThumb from "@/components/student/VideoThumb";
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
import DocumentViewerDialog from "@/components/media/DocumentViewerDialog";
import BunnyStreamPlayer from "@/components/video/BunnyStreamPlayer";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherExams } from "@/hooks/useExams";
import { supabase } from "@/integrations/supabase/client";
import ContentUpsertDialog, {
  ContentItem,
  ContentType,
  extractStoragePathFromPublicUrl,
} from "@/components/content/ContentUpsertDialog";
import AiLessonManager from "@/components/teacher/AiLessonManager";
import LiveTabContent from "@/components/live/LiveTabContent";
import ExamsHomePage from "@/pages/teacher/exams/ExamsHomePage";
import { getCurrentTermForStageGrade } from "@/lib/termSystem";
import { normalizeEducationType, normalizeSectionForSubjects } from "@/lib/educationSection";
import { getOriginalDeveloperAccessToken, isImpersonating } from "@/lib/devImpersonation";
import LessonCardText from "@/components/content/LessonCardText";
import {
  BookOpen,
  ChevronLeft,
  Upload,
  FileText,
  Video,
  Download,
  Play,
  Loader2,
  FileQuestion,
  Plus,
  Trash2,
  Edit,
  Eye,
  Calendar,
  Radio,
  Bot,
  Filter,
  Star,
  Lock,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Sub-subjects for Arabic materials
const ARABIC_SUB_SUBJECTS = ["نحو", "صرف", "بلاغة", "الأدب والنصوص", "القراءة", "التعبير"];
// Sub-subjects for Sharia materials  
const SHARIA_SUB_SUBJECTS = ["فقه", "حديث", "تفسير", "توحيد", "سيرة"];

type SubjectRow = {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

type ContentRow = {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  created_at: string | null;
  group_id: string | null;
  sub_subject: string | null;
  sub_subject_id?: string | null;
  subject_id?: string | null;
  is_free_preview?: boolean;
  education_type?: string | null;
  target_section?: string | null;
  uploaded_by?: string | null;
};


type GroupRow = {
  id: string;
  title: string;
  description: string | null;
  month_label: string | null;
  image_url: string | null;
  price: number;
  price_approved: boolean | null;
  section_name: string;
  subject_id: string;
  is_active: boolean;
  lesson_count: number | null;
  start_date: string | null;
  end_date: string | null;
  term?: string | null;
  education_type?: string | null;
};

const uniqueValues = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean)));

const isContentTargetDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debugContent") === "1" || window.localStorage.getItem("modrek-content-target-debug") === "1";
};

const traceContentTarget = (stage: string, payload: Record<string, unknown>) => {
  if (!isContentTargetDebugEnabled()) return;
  console.info(`[content-target-debug] ${stage}`, payload);
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabelFn(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

function getSubSubjects(category: string): string[] {
  const cat = category.toLowerCase();
  if (cat.includes("عربي") || cat === "arabic") return ARABIC_SUB_SUBJECTS;
  if (cat.includes("شرعي") || cat === "religious" || cat === "sharia") return SHARIA_SUB_SUBJECTS;
  return [];
}

// Section filter component
const SectionFilter = ({ 
  value, 
  onChange, 
  hasSections 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  hasSections: boolean;
}) => {
  if (!hasSections) return null;
  return (
    <div className="flex items-center gap-1.5 mb-4">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex rounded-lg border border-border overflow-hidden">
        {[
          { key: "all", label: "الكل" },
          { key: "scientific", label: "علمي" },
          { key: "literary", label: "أدبي" },
        ].map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`px-3 py-1.5 text-xs font-semibold transition-all ${
              value === opt.key
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// Video thumbnail component (shared logic: signed Bunny poster + frame fallback)
const VideoThumbnail = ({ url }: { url: string }) => (
  <VideoThumb url={url} className="w-[60px] h-[42px] shrink-0" rounded="rounded-lg" />
);


const TeacherUploadContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, session, isAuthReady, role } = useAuth();
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();

  // Admin override: when admin manages teacher's content
  const teacherIdOverride = searchParams.get("teacherId");
  const isAdminImpersonating = !!teacherIdOverride;
  const isDeveloper = role === "admin";
  // Detect developer session impersonating a teacher via magic-link (session becomes the teacher's,
  // so role === "teacher" but a localStorage flag is set by devImpersonation.ts).
  const isDevImpersonation = typeof window !== "undefined" && isImpersonating();
  // Show developer-only tools (free preview toggle) whenever a developer is present on this page.
  const isAdminMode = isAdminImpersonating || isDeveloper || isDevImpersonation;
  const effectiveUserId = teacherIdOverride || user?.id;

  const [allSubjects, setAllSubjects] = useState<SubjectRow[]>([]);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTerm, setCurrentTerm] = useState<string | null>(null);

  // Section filter for viewing content
  const [sectionFilter, setSectionFilter] = useState<string>("all");

  // Section targeting - only used during upload
  const [sectionTarget, setSectionTarget] = useState<string>("both");

  // Education type targeting - for secondary stages
  // For Arabic/Sharia teachers, this is automatically set to the teacher's own education_type
  // and the picker is hidden in the upload dialog.
  const [educationTypeTarget, setEducationTypeTarget] = useState<string>("both");
  const [teacherEducationType, setTeacherEducationType] = useState<string | null>(null);

  // Sub-subject from URL (using sub_subjects table)
  const subSubjectId = searchParams.get("subSubjectId") || "";
  const subSubjectName = searchParams.get("subSubjectName") || "";

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<ContentType>("video");
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; title: string } | null>(null);

  const subjectName = searchParams.get("subjectName") || "";
  const groupIdParam = searchParams.get("groupId") || "";
  const categoryParam = searchParams.get("category") || "";
  const examReturnTo = useMemo(() => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("tab", "exams");
    const query = nextParams.toString();
    return `${location.pathname}${query ? `?${query}` : ""}`;
  }, [location.pathname, location.search]);
  const activeExamGroupId = selectedGroup?.id || groupIdParam;
  const activeExamSubjectId = selectedGroup?.subject_id || subjectId || "";
  const { data: groupExamRows = [] } = useTeacherExams({
    subjectId: activeExamSubjectId,
    groupId: activeExamGroupId,
    term: currentTerm || undefined,
    subSubjectId: subSubjectId || undefined,
  });

  // Get available sub-subjects based on category (for backwards compatibility)
  const availableSubSubjects = useMemo(() => {
    return getSubSubjects(categoryParam);
  }, [categoryParam]);

  const backTo = useMemo(() => {
    const stage = searchParams.get("stage") || "";
    const grade = searchParams.get("grade") || "";
    const category = searchParams.get("category") || "";
    const teacherParam = teacherIdOverride ? `&teacherId=${teacherIdOverride}` : "";
    const basePrefix = isAdminMode ? "/admin/upload" : "/teacher";
    
    if (!stage || !grade || !category) return isAdminMode ? "/admin/upload" : "/teacher";
    
    if (subSubjectId) {
      return `${basePrefix}/sub-subjects/${subjectId}?stage=${stage}&grade=${encodeURIComponent(grade)}&category=${encodeURIComponent(category)}&subjectName=${encodeURIComponent(subjectName)}&groupId=${groupIdParam}${teacherParam}`;
    }
    if (isAdminMode) {
      return `/admin/upload/content?subjectId=${subjectId}&stage=${stage}&grade=${grade}&category=${category}`;
    }
    return `/teacher/subject?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`;
  }, [searchParams, subjectId, subSubjectId, subjectName, groupIdParam, isAdminMode, teacherIdOverride]);

  // Build a map from subject_id -> section
  const subjectSectionMap = useMemo(() => {
    const map: Record<string, string> = {};
    allSubjects.forEach(s => {
      if (s.section) map[s.id] = s.section;
    });
    return map;
  }, [allSubjects]);

  // Fetch subject variants
  useEffect(() => {
    if (!subjectId) return;
    if (subject?.id === subjectId) return;
    const fetchSubjectVariants = async () => {
      try {
        const { data: mainSubject } = await supabase
          .from("subjects")
          .select("id, name, stage, grade, section, category")
          .eq("id", subjectId)
          .maybeSingle();

        if (!mainSubject) return;
        setSubject(mainSubject as SubjectRow);
        setCurrentTerm(await getCurrentTermForStageGrade(mainSubject.stage, mainSubject.grade));

        const { data: variants } = await supabase
          .from("subjects")
          .select("id, name, stage, grade, section, category")
          .eq("name", subjectName || mainSubject.name)
          .eq("stage", mainSubject.stage)
          .eq("grade", mainSubject.grade)
          .eq("is_active", true);

        setAllSubjects((variants as SubjectRow[]) || [mainSubject as SubjectRow]);
      } catch (e) {
        console.error("Error fetching subject:", e);
      }
    };
    fetchSubjectVariants();
  }, [subjectId, subjectName]);

  // Fetch the group from URL param
  useEffect(() => {
    if (!groupIdParam || !effectiveUserId || !currentTerm) return;
    if (selectedGroup?.id === groupIdParam) return;
    const fetchGroup = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from("content_groups")
          .select("*")
          .eq("id", groupIdParam)
          .eq("term", currentTerm)
          .or(`teacher_id.eq.${effectiveUserId},created_by.eq.${effectiveUserId}`)
          .maybeSingle();

        if (data) {
          setSelectedGroup(data as GroupRow);
          await fetchGroupContent(data.id);
        } else {
          setSelectedGroup(null);
          setContent([]);
        }
      } catch (e) {
        console.error("Error fetching group:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchGroup();
  }, [groupIdParam, effectiveUserId, currentTerm]);

  // Mark loading done if no groupId
  useEffect(() => {
    if (!groupIdParam && subject) {
      setIsLoading(false);
    }
  }, [groupIdParam, subject]);

  const getRelatedGroupIdsForActiveSelection = async (groupId: string) => {
    const relatedGroupIds = new Set<string>([groupId]);
    const subjectIdsInScope = uniqueValues(allSubjects.map((item) => item.id));
    const selectedTitle = String(selectedGroup?.title || "").trim();
    const selectedMonth = String(selectedGroup?.month_label || "").trim();

    if (!effectiveUserId || !currentTerm || subjectIdsInScope.length === 0 || !selectedGroup) {
      return relatedGroupIds;
    }

    let groupQuery = supabase
      .from("content_groups")
      .select("id, title, month_label, subject_id")
      .in("subject_id", subjectIdsInScope)
      .eq("is_active", true)
      .eq("term", currentTerm)
      .or(`teacher_id.eq.${effectiveUserId},created_by.eq.${effectiveUserId}`);

    if (selectedMonth) {
      groupQuery = groupQuery.eq("month_label", selectedMonth);
    } else if (selectedTitle) {
      groupQuery = groupQuery.eq("title", selectedTitle);
    }

    const { data: siblingGroups, error: siblingGroupError } = await groupQuery;
    if (siblingGroupError) throw siblingGroupError;
    ((siblingGroups || []) as Array<{ id: string }>).forEach((group) => {
      if (group.id) relatedGroupIds.add(group.id);
    });
    return relatedGroupIds;
  };

  // Fetch content for selected group - now also fetch subject_id
  const fetchGroupContent = async (groupId: string) => {
    if (!effectiveUserId || !currentTerm) return;
    try {
      const relatedGroupIds = await getRelatedGroupIdsForActiveSelection(groupId);

      let relatedSubSubjectIds: string[] | null = null;
      let relatedSubSubjectNames: string[] | null = null;
      if (subSubjectId) {
        const { data: selectedSubSubject } = await supabase
          .from("sub_subjects")
          .select("name")
          .eq("id", subSubjectId)
          .maybeSingle();

        const cleanSubSubjectName = String((selectedSubSubject as any)?.name || subSubjectName || "").trim();
        if (cleanSubSubjectName && relatedGroupIds.size > 0) {
          const { data: matchingSubSubjects, error: subSubjectError } = await supabase
            .from("sub_subjects")
            .select("id, name")
            .in("group_id", Array.from(relatedGroupIds))
            .eq("is_active", true)
            .eq("name", cleanSubSubjectName);
          if (subSubjectError) throw subSubjectError;
          relatedSubSubjectIds = uniqueValues(((matchingSubSubjects || []) as Array<{ id: string }>).map((row) => row.id));
          relatedSubSubjectNames = [cleanSubSubjectName];
        } else {
          relatedSubSubjectIds = [subSubjectId];
          relatedSubSubjectNames = subSubjectName ? [subSubjectName] : null;
        }
      }

      traceContentTarget("teacher-view.query-start", {
        groupId,
        relatedGroupIds: Array.from(relatedGroupIds),
        effectiveUserId,
        currentTerm,
        subSubjectId: subSubjectId || null,
        relatedSubSubjectIds,
        sectionFilter,
        hasSections,
        selectedGroup: selectedGroup ? {
          id: selectedGroup.id,
          title: selectedGroup.title,
          subjectId: selectedGroup.subject_id,
          term: selectedGroup.term,
          educationType: selectedGroup.education_type || null,
        } : null,
      });

      const buildQuery = (includeFreePreview: boolean) => {
        const selectColumns = includeFreePreview
          ? "id, title, type, file_url, description, created_at, group_id, sub_subject, sub_subject_id, subject_id, is_free_preview, education_type, target_section, uploaded_by"
          : "id, title, type, file_url, description, created_at, group_id, sub_subject, sub_subject_id, subject_id, education_type, target_section, uploaded_by";

        const q = (supabase.from("content") as any)
        .select(selectColumns)
        .in("group_id", Array.from(relatedGroupIds))
        .eq("is_active", true)
        .eq("uploaded_by", effectiveUserId)
        .eq("term", currentTerm);

        return q.order("created_at", { ascending: false });
      };

      const query = buildQuery(true);
      if (!query) {
        setContent([]);
        return;
      }
      let { data: contentData, error } = await query;

      if (error && String(error.message || "").includes("is_free_preview")) {
        console.warn("[content] is_free_preview unavailable; retrying legacy content query", error);
        const legacyQuery = buildQuery(false);
        if (!legacyQuery) {
          setContent([]);
          return;
        }
        const legacyRes = await legacyQuery;
        contentData = ((legacyRes.data || []) as any[]).map((row) => ({ ...row, is_free_preview: false }));
        error = legacyRes.error;
      }

      if (error) throw error;
      
      // Deduplicate only exact duplicate rows. Do not collapse rows that share the
      // same file_url but have different targeting, because one upload can create
      // separate علمي/أدبي or عام/أزهر variants for the same file.
      const rows = ((contentData || []) as any[]).filter((row) => {
        if (!subSubjectId) return true;
        const rowSubSubjectName = String(row.sub_subject || "").trim();
        const idMatches = relatedSubSubjectIds ? relatedSubSubjectIds.includes(row.sub_subject_id) : row.sub_subject_id === subSubjectId;
        const nameMatches = relatedSubSubjectNames ? relatedSubSubjectNames.includes(rowSubSubjectName) : false;
        return idMatches || nameMatches;
      });
      const seen = new Set<string>();
      const deduped = rows.filter(c => {
        const key = [
          c.file_url || c.id,
          c.education_type || "both-edu",
          c.target_section || "both-section",
          c.sub_subject_id || c.sub_subject || "no-sub",
          c.type || "content",
        ].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      traceContentTarget("teacher-view.query-result", {
        groupId,
        rawRows: rows.length,
        dedupedRows: deduped.length,
        rows: deduped.map((row) => ({
          id: row.id,
          title: row.title,
          type: row.type,
          subjectId: row.subject_id || null,
          groupId: row.group_id || null,
          subSubjectId: row.sub_subject_id || null,
          educationType: row.education_type || null,
          targetSection: row.target_section || null,
          term: row.term || currentTerm,
          uploadedBy: effectiveUserId,
        })),
      });

      setContent(deduped as ContentRow[]);
    } catch (e) {
      console.error(e);
      traceContentTarget("teacher-view.query-error", {
        groupId,
        effectiveUserId,
        currentTerm,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  useEffect(() => {
    if (selectedGroup?.id) {
      fetchGroupContent(selectedGroup.id);
    }
  }, [sectionFilter, selectedGroup?.id, subSubjectId, currentTerm, effectiveUserId, allSubjects]);

  const hasSections = allSubjects.some(s => s.section);

  // Determine which targeting controls should be shown based on subject category.
  // Rules (per product spec):
  // - arabic / sharia / religious: NO education-type targeting (separate teacher per type),
  //   and NO section targeting (these subjects don't split scientific/literary).
  // - science (الفيزياء/الكيمياء/الأحياء): only scientific students — hide section targeting.
  // - literary (تاريخ/جغرافيا/فلسفة): only literary students — hide section targeting.
  // - mathematics / english / french / others: show both controls (when applicable).
  const categoryLower = (subject?.category || categoryParam || "").toLowerCase();
  const isArabic = categoryLower === "arabic" || categoryLower.includes("عرب");
  const isSharia =
    categoryLower === "sharia" ||
    categoryLower === "religious" ||
    categoryLower.includes("شرع");
  const isArabicOrSharia = isArabic || isSharia;
  const isSecondaryStage = subject?.stage === "secondary";

  // Categories that inherently belong to a single section (scientific-only or literary-only).
  // For these, hide the scientific/literary selector — content is always for that one section.
  const isSingleSectionCategory = [
    "science", "scientific", "integrated_science",
    "literary", "history_geo",
  ].includes(categoryLower);

  // Show scientific/literary targeting only for secondary subjects that actually have BOTH variants.
  // Arabic AND Sharia teachers are allowed to target scientific/literary (both tracks exist for them).
  const distinctSections = new Set(
    allSubjects.map(s => normalizeSectionForSubjects(s.section)).filter(Boolean)
  );
  const hasBothSectionVariants = distinctSections.size >= 2;
  const showSectionTarget =
    isSecondaryStage && hasBothSectionVariants && !isSingleSectionCategory;
  // Education-type targeting hidden for arabic/sharia (separate teachers); shown for secondary otherwise
  const selectedGroupEducationType = normalizeEducationType((selectedGroup as any)?.education_type);
  const normalizedTeacherEducationType = normalizeEducationType(teacherEducationType);
  const showEducationTypeTargetComputed = !selectedGroupEducationType && !isArabicOrSharia && isSecondaryStage;

  // Filter content by section
  const filterBySection = (items: ContentRow[]) => {
    if (!hasSections || sectionFilter === "all") return items;
    return items.filter(item => {
      const explicitTarget = normalizeSectionForSubjects(item.target_section);
      if (!explicitTarget) return true;
      return explicitTarget === sectionFilter;
    });
  };

  const videos = useMemo(() => filterBySection(content.filter((c) => c.type === "video")), [content, sectionFilter, hasSections, subjectSectionMap]);
  const books = useMemo(() => filterBySection(content.filter((c) => c.type === "pdf")), [content, sectionFilter, hasSections, subjectSectionMap]);
  // Fetch teacher's own education_type (from teacher_requests) — used to auto-stamp Arabic/Sharia uploads
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("teacher_requests")
        .select("education_type")
        .eq("user_id", effectiveUserId)
        .maybeSingle();
      if (!cancelled) setTeacherEducationType((data as any)?.education_type || null);
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId]);

  const openUpload = (type: ContentType) => {
    if (!isAuthReady || !session?.access_token || !effectiveUserId) {
      toast({ title: "جاري تجهيز الحساب", description: "انتظر لحظة ثم أعد المحاولة." });
      return;
    }
    setUploadType(type);
    // Default: target both sections + both education types (no filter unless teacher chooses).
    setSectionTarget("both");
    if (selectedGroupEducationType) {
      setEducationTypeTarget(selectedGroupEducationType);
    } else if (isArabicOrSharia) {
      if (!normalizedTeacherEducationType) {
        toast({
          title: "لم يتم تحديد نوع تعليم المعلم",
          description: "لا يمكن رفع محتوى العربي أو الشرعي قبل اكتمال نوع التعليم في حساب المعلم.",
          variant: "destructive",
        });
        return;
      }
      setEducationTypeTarget(normalizedTeacherEducationType);
    // For Arabic/Sharia subjects the teacher does NOT pick — content is auto-stamped
    // with the teacher's own education_type so it only reaches matching students.
    } else {
      setEducationTypeTarget("both");
    }
    setUploadOpen(true);
  };

  const openEdit = (item: ContentRow) => {
    setEditItem({
      id: item.id,
      title: item.title,
      type: item.type,
      file_url: item.file_url,
      description: item.description,
      sub_subject: item.sub_subject,
      subject_id: item.subject_id || null,
      education_type: item.education_type || null,
      target_section: item.target_section || null,
    });
    setEditOpen(true);
  };

  // Deleting through a single server-side RPC that enforces the 24h teacher window.
  // When a developer is impersonating a teacher, use the ORIGINAL developer token so
  // the server sees an admin (same pattern as the free-preview toggle below).
  const callDeleteGroupContent = async (contentId: string) => {
    const originalDeveloperToken = isDevImpersonation ? getOriginalDeveloperAccessToken() : null;
    if (originalDeveloperToken) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      if (!supabaseUrl || !publishableKey) throw new Error("تعذر تجهيز اتصال قاعدة البيانات");
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/delete_group_content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${originalDeveloperToken}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({ _content_id: contentId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "فشل حذف المحتوى");
      return body;
    }
    const { data, error } = await (supabase.rpc as any)("delete_group_content", { _content_id: contentId });
    if (error) throw new Error(error.message);
    return data;
  };

  const handleDelete = async (item: ContentRow) => {

    if (!canDeleteTeacherContent({ createdAt: item.created_at, isAdminMode })) {
      toast({
        title: "غير مسموح",
        description: "انتهت مهلة الحذف (24 ساعة من وقت الرفع). تواصل مع الإدارة.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm("هل أنت متأكد من حذف هذا المحتوى؟")) return;
    try {
      const parsed = extractStoragePathFromPublicUrl(item.file_url);
      if (parsed) await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      await callDeleteGroupContent(item.id);
      toast({ title: "تم", description: "تم حذف المحتوى" });
      if (selectedGroup) fetchGroupContent(selectedGroup.id);
    } catch (e: any) {
      console.error(e);
      const raw = String(e?.message || "");
      toast({
        title: "خطأ",
        description: raw.includes("DELETE_WINDOW_EXPIRED")
          ? "لا يمكن حذف هذا المحتوى بعد مرور 24 ساعة من وقت الرفع."
          : "فشل حذف المحتوى",
        variant: "destructive",
      });
    }
  };


  // ===== Developer-only: toggle "Free Preview" via long-press =====
  const [freePreviewItem, setFreePreviewItem] = useState<ContentRow | null>(null);
  const longPressTimerRef = useMemo(() => ({ current: null as ReturnType<typeof setTimeout> | null }), []);

  const startLongPress = (item: ContentRow) => {
    if (!isAdminMode) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setFreePreviewItem(item);
    }, 550);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const callAdminSetContentFreePreview = async (contentId: string, next: boolean) => {
    const originalDeveloperToken = isDevImpersonation ? getOriginalDeveloperAccessToken() : null;

    if (originalDeveloperToken) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      if (!supabaseUrl || !publishableKey) throw new Error("تعذر تجهيز اتصال قاعدة البيانات");

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_set_content_free_preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${originalDeveloperToken}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({ _content_id: contentId, _is_free_preview: next }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "فشل تعديل حالة المجانية");
      }
      return Array.isArray(body) ? body[0] : body;
    }

    const { data, error } = await (supabase.rpc as any)("admin_set_content_free_preview", {
      _content_id: contentId,
      _is_free_preview: next,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  };

  const toggleFreePreview = async (item: ContentRow) => {
    try {
      const next = !(item.is_free_preview === true);
      const result = await callAdminSetContentFreePreview(item.id, next);
      const targetIds = Array.isArray(result?.updated_ids) && result.updated_ids.length > 0
        ? result.updated_ids
        : [item.id];
      setContent(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, is_free_preview: next } : c));
      if (selectedGroup?.id) await fetchGroupContent(selectedGroup.id);
      toast({
        title: next ? "تم التعيين كمحتوى مجاني" : "تمت إزالة المجانية",
        description: next ? "تم فتح كل النسخ المرتبطة بهذا العنصر للطلاب غير المشتركين." : "أصبح المحتوى مغلقاً لغير المشتركين.",
      });
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: e?.message || "فشل تعديل حالة المجانية", variant: "destructive" });
    } finally {
      setFreePreviewItem(null);
    }
  };



  const getUploadSubjectIds = (): string[] => {
    const fallbackSubjectId = subjectId || selectedGroup?.subject_id || "";
    if (showSectionTarget && sectionTarget === "both") {
      return allSubjects.length ? allSubjects.map(s => s.id).filter(Boolean) : [fallbackSubjectId].filter(Boolean);
    }
    if (sectionTarget === "scientific") {
      const ids = allSubjects
        .filter(s => normalizeSectionForSubjects(s.section) === "scientific")
        .map(s => s.id)
        .filter(Boolean);
      return ids.length ? ids : [fallbackSubjectId].filter(Boolean);
    }
    if (sectionTarget === "literary") {
      const ids = allSubjects
        .filter(s => normalizeSectionForSubjects(s.section) === "literary")
        .map(s => s.id)
        .filter(Boolean);
      return ids.length ? ids : [fallbackSubjectId].filter(Boolean);
    }
    return [selectedGroup?.subject_id || fallbackSubjectId].filter(Boolean);
  };

  const getActiveSubjectId = (): string => {
    if (selectedGroup?.subject_id) return selectedGroup.subject_id;
    if (sectionTarget === "scientific") {
      const sci = allSubjects.find(s => normalizeSectionForSubjects(s.section) === "scientific");
      return sci?.id || subjectId!;
    }
    if (sectionTarget === "literary") {
      const lit = allSubjects.find(s => normalizeSectionForSubjects(s.section) === "literary");
      return lit?.id || subjectId!;
    }
    return subjectId!;
  };

  const resolvedUploadEducationTarget = selectedGroupEducationType || (isArabicOrSharia ? normalizedTeacherEducationType : educationTypeTarget);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <h2 className="text-lg font-semibold">المادة غير موجودة</h2>
            <p className="text-muted-foreground mt-2">تأكد من رابط المادة أو ارجع لقائمة المواد.</p>
            <Button className="mt-4" onClick={() => navigate("/teacher")}>رجوع</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subtitle = `${stageLabel(subject.stage)} - ${gradeLabelFn(subject.grade)}`;

  // Get section badge for a content item
  const getSectionBadge = (item: ContentRow) => {
    if (!hasSections) return null;
    const targetSection = normalizeSectionForSubjects(item.target_section);
    if (!targetSection) {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50">
          الجميع
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
        targetSection === "scientific" ? "border-blue-300 text-blue-600 bg-blue-50" : "border-purple-300 text-purple-600 bg-purple-50"
      }`}>
        {targetSection === "scientific" ? "علمي" : "أدبي"}
      </Badge>
    );
  };

  const renderContentList = (items: ContentRow[], type: string, emptyIcon: any, emptyText: string, uploadFn: () => void, uploadLabel: string) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button type="button" onClick={(e) => { e.preventDefault(); uploadFn(); }} className="gap-2">
          <Plus className="h-5 w-5" />
          {uploadLabel}
        </Button>
      </div>
      <SectionFilter value={sectionFilter} onChange={setSectionFilter} hasSections={hasSections} />
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          {emptyIcon}
          <h3 className="text-lg font-semibold mb-2">{emptyText}</h3>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {type === "video" ? (
                    <VideoThumbnail url={item.file_url} />
                  ) : (
                    <div className="p-3 rounded-lg bg-accent shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <h3
                        dir="auto"
                        className="font-semibold text-foreground text-sm line-clamp-2 min-w-0 flex-1 break-words [overflow-wrap:anywhere]"
                      >
                        {item.title}
                      </h3>
                      {getSectionBadge(item)}
                      {item.is_free_preview && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-700 border border-amber-300 gap-1 shrink-0">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          مجاني
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <LessonCardText text={item.description} className="mt-1 text-xs text-muted-foreground leading-5" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 justify-end flex-wrap">

                  {type === "video" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs h-8 px-2"
                      onClick={(e) => {
                        e.preventDefault();
                        setPreviewVideo({ url: item.file_url, title: item.title });
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      مشاهدة
                    </Button>
                  ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs h-8 px-2"
                    onClick={(e) => {
                      e.preventDefault();
                      setPreviewDocument({ url: item.file_url, title: item.title });
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    فتح
                  </Button>
                )}
                {isAdminMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${item.is_free_preview ? "text-amber-600 hover:text-amber-700" : "text-muted-foreground hover:text-amber-600"}`}
                    title={item.is_free_preview ? "إزالة المجانية" : "تعيين كمحتوى مجاني"}
                    aria-label={item.is_free_preview ? "إزالة المجانية" : "تعيين كمحتوى مجاني"}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFreePreviewItem(item); }}
                  >
                    <Star className={`h-3.5 w-3.5 ${item.is_free_preview ? "fill-amber-500 text-amber-500" : ""}`} />
                  </Button>
                )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={(e) => { e.preventDefault(); openEdit(item); }}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" type="button" onClick={(e) => { e.preventDefault(); handleDelete(item); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to={isAdminMode ? "/admin" : "/teacher"} className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-gradient-mudrik">
              {isAdminMode ? "مدرك Plus - المطور" : "مدرك Plus - المعلم"}
            </span>
          </Link>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">{isAdminMode ? "المطور" : "الرفع"}</span>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6">
        <Button variant="ghost" size="sm" className="mb-4 hover:bg-accent" type="button" onClick={() => navigate(backTo)}>
          <ChevronLeft className="h-4 w-4 rotate-180 ml-1" />
          {subSubjectId ? "رجوع لأقسام المادة" : "رجوع للمجموعات"}
        </Button>

        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-0.5">{subSubjectName || subject.name}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {selectedGroup && (
              <div className="text-left">
                <Badge className="bg-primary text-primary-foreground font-bold text-sm px-3 py-1">
                  {selectedGroup.title}
                </Badge>
                {selectedGroup.month_label && (
                  <Badge variant="outline" className="text-[10px] gap-1 mr-2">
                    <Calendar className="h-3 w-3" />
                    {selectedGroup.month_label}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section/education-type targeting is now optional via the 3-dots button inside the upload dialog. */}

        {/* Content Tabs */}
        <Tabs defaultValue={searchParams.get("tab") || "lessons"} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="lessons" className="gap-1 text-xs px-1">
              <Video className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">الدروس</span>
              <span className="text-[10px] bg-muted px-1 rounded">{videos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="books" className="gap-1 text-xs px-1">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">الكتب</span>
              <span className="text-[10px] bg-muted px-1 rounded">{books.length}</span>
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-1 text-xs px-1">
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Live</span>
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-1 text-xs px-1">
              <FileQuestion className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">امتحانات</span>
              <span className="text-[10px] bg-muted px-1 rounded">{groupExamRows.length}</span>
            </TabsTrigger>
            <TabsTrigger value="ai-assistant" className="gap-1 text-xs px-1">
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ذكي</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lessons">
            {renderContentList(videos, "video", <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد فيديوهات", () => openUpload("video"), "رفع فيديو جديد")}
          </TabsContent>
          <TabsContent value="books">
            {renderContentList(books, "pdf", <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />, "لا توجد كتب", () => openUpload("pdf"), "رفع كتاب PDF")}
          </TabsContent>
          <TabsContent value="live">
            <SectionFilter value={sectionFilter} onChange={setSectionFilter} hasSections={hasSections} />
            <LiveTabContent groupId={selectedGroup?.id || ""} groupTitle={selectedGroup?.title || ""} isTeacher={true} />
          </TabsContent>
          <TabsContent value="exams">
            <ExamsHomePage
              embedded
              subjectId={activeExamSubjectId}
              groupId={activeExamGroupId}
              subSubjectId={subSubjectId || undefined}
              term={currentTerm || undefined}
              returnTo={examReturnTo}
              title={`امتحانات ${subSubjectName || subject.name}`}
              subtitle="هذه الامتحانات خاصة بهذه المجموعة والمادة الفرعية فقط"
            />
          </TabsContent>
          <TabsContent value="ai-assistant">
            <SectionFilter value={sectionFilter} onChange={setSectionFilter} hasSections={hasSections} />
            <AiLessonManager 
              subjectId={subjectId!} 
              groupId={selectedGroup?.id}
              subSubjectId={subSubjectId || undefined}
              userId={effectiveUserId || ""}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Upload Dialog */}
      {uploadOpen && (
        <ContentUpsertDialog
          mode="create"
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          subjectId={getActiveSubjectId()}
          type={uploadType}
          uploadedBy={effectiveUserId}
          sessionAccessToken={session?.access_token}
          onSuccess={() => {
            if (selectedGroup) fetchGroupContent(selectedGroup.id);
          }}
          groups={selectedGroup ? [{ id: selectedGroup.id, title: selectedGroup.title, term: selectedGroup.term }] : []}
          sectionTarget={sectionTarget}
          allSubjectIds={getUploadSubjectIds()}
          defaultGroupId={selectedGroup?.id}
          hasSections={showSectionTarget}
          onSectionTargetChange={setSectionTarget}
          subSubjects={availableSubSubjects}
          defaultSubSubject={subSubjectName || undefined}
          subSubjectId={subSubjectId || undefined}
          currentTerm={currentTerm || undefined}
          showEducationTypeTarget={showEducationTypeTargetComputed}
          educationTypeTarget={resolvedUploadEducationTarget}
          onEducationTypeTargetChange={setEducationTypeTarget}
        />
      )}

      {/* Edit Dialog */}
      {editOpen && editItem && (
        <ContentUpsertDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          subjectId={subjectId!}
          item={editItem}
          sectionTarget={editItem.target_section || undefined}
          educationTypeTarget={editItem.education_type || "both"}
          hasSections={showSectionTarget}
          onSectionTargetChange={(target) => setEditItem((prev) => prev ? { ...prev, target_section: target === "both" ? null : target } : prev)}
          showEducationTypeTarget={showEducationTypeTargetComputed}
          onEducationTypeTargetChange={(target) => setEditItem((prev) => prev ? { ...prev, education_type: target === "both" ? null : target } : prev)}
          onSuccess={() => {
            if (selectedGroup) fetchGroupContent(selectedGroup.id);
          }}
          subSubjects={availableSubSubjects}
        />
      )}

      {/* Video Preview Player (teacher) */}
      {previewVideo && (
        isBunnyVideo(previewVideo.url) ? (
          <BunnyStreamPlayer
            url={previewVideo.url}
            title={previewVideo.title}
            onClose={() => setPreviewVideo(null)}
          />
        ) : (
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-black"
            onClick={() => setPreviewVideo(null)}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black/80 text-white">
              <h3 className="text-sm sm:text-base font-semibold truncate flex-1 text-center">{previewVideo.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                aria-label="إغلاق"
                className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <video
                src={resolveBunnyStorageUrl(previewVideo.url)}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                className="max-w-full max-h-full"
              />
            </div>
          </div>
        )
      )}

      {previewDocument && (
        <DocumentViewerDialog
          open
          fileUrl={previewDocument.url}
          title={previewDocument.title}
          onClose={() => setPreviewDocument(null)}
        />
      )}

      {/* Developer-only: toggle free preview (long-press) */}
      {isAdminMode && (
        <AlertDialog open={!!freePreviewItem} onOpenChange={(o) => !o && setFreePreviewItem(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {freePreviewItem?.is_free_preview ? "إزالة المجانية" : "تعيين كمحتوى مجاني"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {freePreviewItem?.is_free_preview
                  ? "سيصبح هذا المحتوى مغلقاً لغير المشتركين مرة أخرى."
                  : "سيظهر هذا العنصر مفتوحاً لجميع الطلاب حتى غير المشتركين، دون تغيير مكانه أو ترتيبه."}
                <br />
                <span className="font-semibold text-foreground">{freePreviewItem?.title}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => freePreviewItem && toggleFreePreview(freePreviewItem)}
                className="gap-2"
              >
                {freePreviewItem?.is_free_preview ? (
                  <><Lock className="h-4 w-4" /> إزالة المجانية</>
                ) : (
                  <><Star className="h-4 w-4" /> تعيين كمجاني</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>

  );
};

export default TeacherUploadContent;
