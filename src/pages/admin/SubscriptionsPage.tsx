import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Search,
  CreditCard,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  BookOpen,
  ChevronLeft,
  Plus,
  RefreshCw,
  Loader2,
  GraduationCap,
  Settings,
  User,
  MessageSquare,
  Edit,
  Save,
} from "lucide-react";

// Types
interface Student {
  id: string;
  full_name: string;
  email: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
}

interface Subject {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
}

interface Subscription {
  id: string;
  student_id: string;
  subject_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  renewal_count: number;
  subjects?: Subject;
  profiles?: Student;
}

interface SubscriptionMessage {
  id: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  welcome_message: string;
  price: string;
  includes_description: string | null;
}

// Constants - Main categories for subscriptions (grouped subjects)
const MAIN_CATEGORIES = [
  { id: "arabic", name: "المواد العربية", includes: "نحو + بلاغة + أدب + نصوص + صرف + مطالعة + إنشاء" },
  { id: "sharia", name: "المواد الشرعية", includes: "فقه + توحيد + تفسير + حديث" },
  { id: "math", name: "الرياضيات", includes: "" },
  { id: "scientific", name: "المواد العلمية", includes: "فيزياء + كيمياء + أحياء" },
  { id: "literary", name: "المواد الأدبية", includes: "تاريخ + جغرافيا + فلسفة ومنطق" },
  { id: "english", name: "اللغة الإنجليزية", includes: "" },
  { id: "french", name: "اللغة الفرنسية", includes: "" },
  { id: "science", name: "العلوم", includes: "" },
  { id: "social", name: "الدراسات", includes: "" },
];

const getCategoriesForStudent = (stage: string | null, section: string | null) => {
  if (stage === "preparatory") {
    return MAIN_CATEGORIES.filter(c => 
      ["arabic", "sharia", "math", "science", "social", "english"].includes(c.id)
    );
  }
  if (stage === "secondary" && section === "scientific") {
    return MAIN_CATEGORIES.filter(c => 
      ["arabic", "sharia", "math", "scientific", "english"].includes(c.id)
    );
  }
  if (stage === "secondary" && section === "literary") {
    return MAIN_CATEGORIES.filter(c => 
      ["arabic", "sharia", "literary", "english", "french"].includes(c.id)
    );
  }
  return MAIN_CATEGORIES;
};

const formatStage = (stage: string | null) => {
  if (stage === "preparatory") return "إعدادي";
  if (stage === "secondary") return "ثانوي";
  return stage || "";
};

const formatGrade = (grade: string | null) => {
  if (grade === "first") return "الأول";
  if (grade === "second") return "الثاني";
  if (grade === "third") return "الثالث";
  return grade || "";
};

const formatSection = (section: string | null) => {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return section || "";
};

const SubscriptionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("manage");

  // Manage Subscription State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentCategories, setStudentCategories] = useState<typeof MAIN_CATEGORIES>([]);
  const [studentSubscriptions, setStudentSubscriptions] = useState<Subscription[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [duration, setDuration] = useState<string>("30");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);

  // Teacher selection for subscription
  const [categoryTeachers, setCategoryTeachers] = useState<Record<string, { teacher_id: string; teacher_name: string; photo_url: string | null }[]>>({});
  const [selectedTeachers, setSelectedTeachers] = useState<Record<string, string>>({});

  // View Subscriptions State
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);

  // Search Status State
  const [statusSearchQuery, setStatusSearchQuery] = useState("");
  const [statusSearchResult, setStatusSearchResult] = useState<{
    student: Student;
    subscriptions: Subscription[];
  } | null>(null);
  const [isStatusSearching, setIsStatusSearching] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    whatsapp: "",
    price: "",
    currency: "جنيه",
    message: "",
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Subscription Messages State
  const [msgStage, setMsgStage] = useState<string>("secondary");
  const [msgGrade, setMsgGrade] = useState<string>("first");
  const [msgSection, setMsgSection] = useState<string>("");
  const [msgCategory, setMsgCategory] = useState<string>("arabic");
  const [subscriptionMessages, setSubscriptionMessages] = useState<SubscriptionMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState({
    welcome_message: "",
    price: "",
    includes_description: "",
  });
  const [isSavingMessage, setIsSavingMessage] = useState(false);

  // Load all subjects once
  useEffect(() => {
    const fetchSubjects = async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section, category")
        .eq("is_active", true);
      setAllSubjects(data || []);
    };
    fetchSubjects();
  }, []);

  // Load initial data
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [
          "subscription_whatsapp",
          "subscription_default_price",
          "subscription_currency",
          "subscription_default_message",
        ]);

      if (data) {
        const settingsMap: Record<string, string> = {};
        data.forEach((item) => {
          if (item.value) settingsMap[item.key] = item.value;
        });
        setSettings({
          whatsapp: settingsMap.subscription_whatsapp || "",
          price: settingsMap.subscription_default_price || "",
          currency: settingsMap.subscription_currency || "جنيه",
          message: settingsMap.subscription_default_message || "",
        });
      }

      // Load subscription messages
      const { data: messages } = await supabase
        .from("subscription_messages")
        .select("*");
      setSubscriptionMessages((messages as SubscriptionMessage[]) || []);

      setLoading(false);
    };

    fetchSettings();
  }, []);

  // Load message when filters change
  useEffect(() => {
    const existing = subscriptionMessages.find(
      m => m.stage === msgStage && 
           m.grade === msgGrade && 
           (msgSection ? m.section === msgSection : !m.section) && 
           m.category === msgCategory
    );
    if (existing) {
      setCurrentMessage({
        welcome_message: existing.welcome_message,
        price: existing.price,
        includes_description: existing.includes_description || "",
      });
    } else {
      const cat = MAIN_CATEGORIES.find(c => c.id === msgCategory);
      setCurrentMessage({
        welcome_message: `مرحباً بك في ${cat?.name || "المادة"}!\nاشترك الآن للوصول لجميع المحتوى.`,
        price: settings.price || "100",
        includes_description: cat?.includes || "",
      });
    }
  }, [msgStage, msgGrade, msgSection, msgCategory, subscriptionMessages, settings.price]);

  // Fetch teachers when categories are selected for subscription
  useEffect(() => {
    if (!selectedStudent || selectedCategories.length === 0) {
      setCategoryTeachers({});
      return;
    }

    const fetchTeachersForCategories = async () => {
      const categoryToArabic: Record<string, string> = {
        arabic: "المواد العربية",
        sharia: "المواد الشرعية",
        religious: "المواد الشرعية",
        science: "العلوم",
        studies: "الدراسات",
        literary: "المواد الأدبية",
        scientific: "المواد العلمية",
        english: "الإنجليزية",
        french: "الفرنسية",
        math: "الرياضيات",
        social: "الدراسات",
      };

      const gradeToArabicPatterns: Record<string, string[]> = {
        first: ["الأول", "first"],
        second: ["الثاني", "second"],
        third: ["الثالث", "third"],
      };

      const result: Record<string, { teacher_id: string; teacher_name: string; photo_url: string | null }[]> = {};

      for (const category of selectedCategories) {
        const arabicCategory = categoryToArabic[category] || category;
        const categoriesToSearch = [category, arabicCategory].filter((v, i, a) => a.indexOf(v) === i);
        const gradePatterns = gradeToArabicPatterns[selectedStudent.grade!] || [selectedStudent.grade!];

        const { data: assignments } = await supabase
          .from("teacher_assignments")
          .select("teacher_id, grade")
          .in("category", categoriesToSearch)
          .eq("stage", selectedStudent.stage!);

        // Filter by grade (handle both English and Arabic)
        const filtered = (assignments || []).filter(a => {
          if (a.grade === selectedStudent.grade) return true;
          for (const pattern of gradePatterns) {
            if (a.grade.includes(pattern)) return true;
          }
          return false;
        });

        if (filtered.length === 0) {
          result[category] = [];
          continue;
        }

        const teacherIds = [...new Set(filtered.map((a) => a.teacher_id))];

        const { data: profiles } = await supabase
          .from("teacher_profiles")
          .select("teacher_id, photo_url")
          .in("teacher_id", teacherIds)
          .eq("is_approved", true);

        if (!profiles || profiles.length === 0) {
          result[category] = [];
          continue;
        }

        const approvedIds = profiles.map((p) => p.teacher_id);
        const { data: names } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", approvedIds);

        const nameMap = new Map(names?.map((n) => [n.id, n.full_name]) || []);
        const photoMap = new Map(profiles.map((p) => [p.teacher_id, p.photo_url]));

        result[category] = approvedIds.map((id) => ({
          teacher_id: id,
          teacher_name: nameMap.get(id) || "معلم",
          photo_url: photoMap.get(id) || null,
        }));
      }

      setCategoryTeachers(result);
    };

    fetchTeachersForCategories();
  }, [selectedCategories, selectedStudent]);

  // Search students
  const searchStudents = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_code, stage, grade, section")
        .or(`full_name.ilike.%${searchQuery}%,student_code.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Error searching students:", error);
      toast.error("خطأ في البحث");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Select student for subscription management - FILTERED by student's stage/grade/section
  const selectStudent = async (student: Student) => {
    setSelectedStudent(student);
    setSearchResults([]);
    setSearchQuery("");
    setSelectedCategories([]);
    setSelectedTeachers({});
    setCategoryTeachers({});

    // Get categories available for this student
    const categories = getCategoriesForStudent(student.stage, student.section);
    setStudentCategories(categories);

    // Fetch existing subscriptions for this student
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*, subjects:subject_id(id, name, stage, grade, section, category)")
      .eq("student_id", student.id);

    setStudentSubscriptions(subs || []);
  };

  // Check if student has active subscription for a category
  const hasActiveCategorySubscription = (category: string) => {
    if (!selectedStudent) return false;
    
    // Get all subjects for this category that match student's stage/grade/section
    const categorySubjects = allSubjects.filter(s => 
      s.category === category &&
      s.stage === selectedStudent.stage &&
      s.grade === selectedStudent.grade &&
      (selectedStudent.section ? s.section === selectedStudent.section : !s.section)
    );
    
    if (categorySubjects.length === 0) return false;
    
    // Check if ALL subjects in this category have active subscriptions
    const now = new Date();
    return categorySubjects.every(subject => {
      const sub = studentSubscriptions.find(s => s.subject_id === subject.id);
      return sub && sub.is_active && new Date(sub.end_date) > now;
    });
  };

  // Get subscription end date for category (returns earliest end date)
  const getCategorySubscriptionEndDate = (category: string): Date | null => {
    if (!selectedStudent) return null;
    
    const categorySubjects = allSubjects.filter(s => 
      s.category === category &&
      s.stage === selectedStudent.stage &&
      s.grade === selectedStudent.grade &&
      (selectedStudent.section ? s.section === selectedStudent.section : !s.section)
    );
    
    const now = new Date();
    let earliestEnd: Date | null = null;
    
    for (const subject of categorySubjects) {
      const sub = studentSubscriptions.find(s => s.subject_id === subject.id);
      if (sub && sub.is_active) {
        const endDate = new Date(sub.end_date);
        if (endDate > now && (!earliestEnd || endDate < earliestEnd)) {
          earliestEnd = endDate;
        }
      }
    }
    
    return earliestEnd;
  };

  // Toggle category selection
  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Save subscriptions - Subscribe to ALL subjects in selected categories
  const saveSubscriptions = async () => {
    if (!selectedStudent || selectedCategories.length === 0) {
      toast.error("يرجى اختيار مادة واحدة على الأقل");
      return;
    }

    // Validate teacher selection for categories that have teachers
    const categoriesNeedingTeacher = selectedCategories.filter((catId) => {
      const teachers = categoryTeachers[catId] || [];
      return teachers.length > 0 && !selectedTeachers[catId];
    });

    if (categoriesNeedingTeacher.length > 0) {
      toast.error("يرجى اختيار المعلم لجميع المواد التي يوجد لها معلمين");
      return;
    }

    setIsSaving(true);
    try {
      const endDate =
        duration === "custom"
          ? new Date(customEndDate)
          : new Date(Date.now() + parseInt(duration) * 24 * 60 * 60 * 1000);

      // Get all subjects that match student's profile and selected categories
      const subjectsToSubscribe = allSubjects.filter(s => 
        selectedCategories.includes(s.category) &&
        s.stage === selectedStudent.stage &&
        s.grade === selectedStudent.grade &&
        (selectedStudent.section ? s.section === selectedStudent.section : !s.section)
      );

      for (const subject of subjectsToSubscribe) {
        const existingSub = studentSubscriptions.find(
          (s) => s.subject_id === subject.id
        );

        const teacherId = selectedTeachers[subject.category] || null;

        if (existingSub) {
          // Update existing subscription
          await supabase
            .from("subscriptions")
            .update({
              end_date: endDate.toISOString(),
              is_active: true,
              renewal_count: (existingSub.renewal_count || 0) + 1,
              teacher_id: teacherId,
            })
            .eq("id", existingSub.id);
        } else {
          // Create new subscription
          await supabase.from("subscriptions").insert({
            student_id: selectedStudent.id,
            subject_id: subject.id,
            start_date: new Date().toISOString(),
            end_date: endDate.toISOString(),
            is_active: true,
            created_by: user?.id,
            teacher_id: teacherId,
          });
        }
      }

      toast.success(`تم تفعيل الاشتراك في ${selectedCategories.length} مادة (${subjectsToSubscribe.length} مادة فرعية)`);
      setSelectedCategories([]);
      setSelectedTeachers({});
      setCategoryTeachers({});
      
      // Refresh subscriptions
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*, subjects:subject_id(id, name, stage, grade, section, category)")
        .eq("student_id", selectedStudent.id);
      setStudentSubscriptions(subs || []);
    } catch (error) {
      console.error("Error saving subscriptions:", error);
      toast.error("خطأ في حفظ الاشتراكات");
    } finally {
      setIsSaving(false);
    }
  };

  // Deactivate subscription for a category
  const deactivateCategorySubscription = async (category: string) => {
    if (!selectedStudent) return;
    
    try {
      const categorySubjects = allSubjects.filter(s => 
        s.category === category &&
        s.stage === selectedStudent.stage &&
        s.grade === selectedStudent.grade &&
        (selectedStudent.section ? s.section === selectedStudent.section : !s.section)
      );
      
      const subjectIds = categorySubjects.map(s => s.id);
      
      await supabase
        .from("subscriptions")
        .update({ is_active: false })
        .eq("student_id", selectedStudent.id)
        .in("subject_id", subjectIds);

      toast.success("تم إلغاء الاشتراك");

      // Refresh
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*, subjects:subject_id(id, name, stage, grade, section, category)")
        .eq("student_id", selectedStudent.id);
      setStudentSubscriptions(subs || []);
    } catch (error) {
      console.error("Error deactivating subscription:", error);
      toast.error("خطأ في إلغاء الاشتراك");
    }
  };

  // Fetch subscriptions by filters
  const fetchSubscriptionsByFilters = useCallback(async () => {
    setLoadingSubscriptions(true);
    try {
      let subjectsQuery = supabase.from("subjects").select("id, name, stage, grade, section, category");
      
      if (stageFilter !== "all") {
        subjectsQuery = subjectsQuery.eq("stage", stageFilter);
      }
      if (gradeFilter !== "all") {
        subjectsQuery = subjectsQuery.eq("grade", gradeFilter);
      }
      if (sectionFilter !== "all") {
        subjectsQuery = subjectsQuery.eq("section", sectionFilter);
      }

      const { data: subjects } = await subjectsQuery;
      const subjectIds = subjects?.map((s) => s.id) || [];

      if (subjectIds.length === 0) {
        setSubscriptions([]);
        setLoadingSubscriptions(false);
        return;
      }

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*")
        .in("subject_id", subjectIds)
        .eq("is_active", true);

      const studentIds = [...new Set(subs?.map((s) => s.student_id) || [])];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_code, stage, grade, section")
        .in("id", studentIds);

      const enrichedSubs = subs?.map((sub) => ({
        ...sub,
        subjects: subjects?.find((s) => s.id === sub.subject_id),
        profiles: profiles?.find((p) => p.id === sub.student_id),
      })) || [];

      setSubscriptions(enrichedSubs);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      toast.error("خطأ في تحميل الاشتراكات");
    } finally {
      setLoadingSubscriptions(false);
    }
  }, [stageFilter, gradeFilter, sectionFilter]);

  useEffect(() => {
    if (activeTab === "view") {
      fetchSubscriptionsByFilters();
    }
  }, [activeTab, fetchSubscriptionsByFilters]);

  // Search subscription status
  const searchSubscriptionStatus = async () => {
    if (!statusSearchQuery.trim()) return;

    setIsStatusSearching(true);
    try {
      const { data: students } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_code, stage, grade, section")
        .or(`student_code.ilike.%${statusSearchQuery}%,full_name.ilike.%${statusSearchQuery}%`)
        .limit(1);

      if (!students || students.length === 0) {
        toast.error("لم يتم العثور على الطالب");
        setStatusSearchResult(null);
        return;
      }

      const student = students[0];

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("student_id", student.id);

      const subjectIds = subs?.map((s) => s.subject_id) || [];
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name, stage, grade, section, category")
        .in("id", subjectIds);

      const enrichedSubs = subs?.map((sub) => ({
        ...sub,
        subjects: subjects?.find((s) => s.id === sub.subject_id),
      })) || [];

      setStatusSearchResult({ student, subscriptions: enrichedSubs });
    } catch (error) {
      console.error("Error searching subscription status:", error);
      toast.error("خطأ في البحث");
    } finally {
      setIsStatusSearching(false);
    }
  };

  // Save settings
  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const updates = [
        { key: "subscription_whatsapp", value: settings.whatsapp },
        { key: "subscription_default_price", value: settings.price },
        { key: "subscription_currency", value: settings.currency },
        { key: "subscription_default_message", value: settings.message },
      ];

      for (const update of updates) {
        await supabase
          .from("platform_settings")
          .upsert({ key: update.key, value: update.value }, { onConflict: "key" });
      }

      toast.success("تم حفظ الإعدادات");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("خطأ في حفظ الإعدادات");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Save subscription message
  const saveSubscriptionMessage = async () => {
    setIsSavingMessage(true);
    try {
      const messageData = {
        stage: msgStage,
        grade: msgGrade,
        section: msgSection || null,
        category: msgCategory,
        welcome_message: currentMessage.welcome_message,
        price: currentMessage.price,
        includes_description: currentMessage.includes_description || null,
        created_by: user?.id,
      };

      const existing = subscriptionMessages.find(
        m => m.stage === msgStage && 
             m.grade === msgGrade && 
             (msgSection ? m.section === msgSection : !m.section) && 
             m.category === msgCategory
      );

      if (existing) {
        await supabase
          .from("subscription_messages")
          .update(messageData)
          .eq("id", existing.id);
      } else {
        await supabase.from("subscription_messages").insert(messageData);
      }

      // Refresh messages
      const { data: messages } = await supabase
        .from("subscription_messages")
        .select("*");
      setSubscriptionMessages((messages as SubscriptionMessage[]) || []);

      toast.success("تم حفظ رسالة الاشتراك");
    } catch (error) {
      console.error("Error saving subscription message:", error);
      toast.error("خطأ في حفظ الرسالة");
    } finally {
      setIsSavingMessage(false);
    }
  };

  // Format dates
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/admin")}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">إدارة الاشتراكات</h1>
            <p className="text-muted-foreground">إدارة اشتراكات الطلاب في المواد</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="manage" className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">تفعيل</span>
            </TabsTrigger>
            <TabsTrigger value="view" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">المشتركين</span>
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">حالة</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">الرسائل</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">إعدادات</span>
            </TabsTrigger>
          </TabsList>

          {/* Manage Subscriptions Tab */}
          <TabsContent value="manage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  تفعيل اشتراك طالب
                </CardTitle>
                <CardDescription>
                  ابحث عن طالب بالاسم أو كود الطالب - ستظهر فقط المواد الخاصة بمرحلته وصفه
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ابحث باسم الطالب أو كود الطالب..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchStudents()}
                      className="pr-10"
                    />
                  </div>
                  <Button onClick={searchStudents} disabled={isSearching}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "بحث"
                    )}
                  </Button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <Card>
                    <CardContent className="p-2">
                      <ScrollArea className="max-h-60">
                        {searchResults.map((student) => (
                          <button
                            key={student.id}
                            onClick={() => selectStudent(student)}
                            className="w-full p-3 text-right hover:bg-accent rounded-lg transition-colors flex items-center gap-3"
                          >
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{student.full_name}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {student.student_code || student.email}
                              </p>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {student.stage && (
                                <Badge variant="secondary" className="text-xs">
                                  {formatStage(student.stage)}
                                </Badge>
                              )}
                              {student.grade && (
                                <Badge variant="outline" className="text-xs">
                                  {formatGrade(student.grade)}
                                </Badge>
                              )}
                              {student.section && (
                                <Badge variant="outline" className="text-xs">
                                  {formatSection(student.section)}
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Selected Student */}
                {selectedStudent && (
                  <div className="space-y-4">
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                            <GraduationCap className="h-6 w-6 text-primary-foreground" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{selectedStudent.full_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {selectedStudent.student_code && `كود: ${selectedStudent.student_code} • `}
                              {formatStage(selectedStudent.stage)} • {formatGrade(selectedStudent.grade)}
                              {selectedStudent.section && ` • ${formatSection(selectedStudent.section)}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedStudent(null)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Categories Selection - Grouped Subjects */}
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">اختر المواد للاشتراك</Label>
                      <p className="text-sm text-muted-foreground">
                        يتم عرض المواد الخاصة بـ {formatStage(selectedStudent.stage)} - {formatGrade(selectedStudent.grade)}
                        {selectedStudent.section && ` - ${formatSection(selectedStudent.section)}`} فقط
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {studentCategories.map((category) => {
                          const isSubscribed = hasActiveCategorySubscription(category.id);
                          const endDate = getCategorySubscriptionEndDate(category.id);

                          return (
                            <Card
                              key={category.id}
                              className={`transition-all cursor-pointer ${
                                isSubscribed
                                  ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                                  : selectedCategories.includes(category.id)
                                  ? "bg-primary/10 border-primary ring-2 ring-primary/20"
                                  : "hover:bg-accent hover:border-primary/50"
                              }`}
                              onClick={() => !isSubscribed && toggleCategory(category.id)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={selectedCategories.includes(category.id)}
                                    onCheckedChange={() => toggleCategory(category.id)}
                                    disabled={isSubscribed}
                                    className="mt-1"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold">{category.name}</span>
                                      {isSubscribed && (
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                      )}
                                    </div>
                                    {category.includes && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        يشمل: {category.includes}
                                      </p>
                                    )}
                                    {isSubscribed && endDate && (
                                      <div className="mt-2">
                                        <p className="text-xs text-green-600 font-medium">
                                          مشترك حتى {formatDate(endDate.toISOString())}
                                        </p>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs text-destructive hover:text-destructive p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deactivateCategorySubscription(category.id);
                                          }}
                                        >
                                          إلغاء الاشتراك
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>

                    {/* Teacher Selection per Category */}
                    {selectedCategories.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <GraduationCap className="h-5 w-5 text-primary" />
                          اختر المعلم لكل مادة
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          حدد المعلم الذي اختاره الطالب لكل مادة لعرض محتواه فقط
                        </p>
                        <div className="grid gap-3">
                          {selectedCategories.map((catId) => {
                            const cat = studentCategories.find((c) => c.id === catId);
                            const teachers = categoryTeachers[catId] || [];

                            return (
                              <Card key={catId} className="border">
                                <CardContent className="p-4 space-y-3">
                                  <Label className="font-medium">{cat?.name || catId}</Label>
                                  {teachers.length === 0 ? (
                                    <p className="text-sm text-amber-600">
                                      لا يوجد معلمين مسجلين لهذه المادة - سيتم التفعيل بدون معلم
                                    </p>
                                  ) : (
                                    <Select
                                      value={selectedTeachers[catId] || ""}
                                      onValueChange={(val) =>
                                        setSelectedTeachers((prev) => ({ ...prev, [catId]: val }))
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="اختر المعلم..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {teachers.map((t) => (
                                          <SelectItem key={t.teacher_id} value={t.teacher_id}>
                                            {t.teacher_name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Duration Selection */}
                    {selectedCategories.length > 0 && (
                      <Card className="bg-accent/50">
                        <CardContent className="p-4 space-y-4">
                          <Label className="text-base font-semibold">مدة الاشتراك</Label>
                          <Select value={duration} onValueChange={setDuration}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="30">30 يوم</SelectItem>
                              <SelectItem value="60">60 يوم</SelectItem>
                              <SelectItem value="90">90 يوم</SelectItem>
                              <SelectItem value="180">180 يوم (6 أشهر)</SelectItem>
                              <SelectItem value="365">365 يوم (سنة)</SelectItem>
                              <SelectItem value="custom">تاريخ مخصص</SelectItem>
                            </SelectContent>
                          </Select>

                          {duration === "custom" && (
                            <Input
                              type="date"
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              min={new Date().toISOString().split("T")[0]}
                            />
                          )}

                          <Button
                            onClick={saveSubscriptions}
                            disabled={isSaving}
                            className="w-full"
                            size="lg"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin ml-2" />
                            ) : (
                              <CheckCircle className="h-4 w-4 ml-2" />
                            )}
                            تفعيل الاشتراك ({selectedCategories.length} مادة)
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* View Subscriptions Tab */}
          <TabsContent value="view" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  عرض المشتركين
                </CardTitle>
                <CardDescription>
                  عرض الطلاب المشتركين حسب المرحلة والصف
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="المرحلة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع المراحل</SelectItem>
                      <SelectItem value="preparatory">إعدادي</SelectItem>
                      <SelectItem value="secondary">ثانوي</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={gradeFilter} onValueChange={setGradeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="الصف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الصفوف</SelectItem>
                      <SelectItem value="first">الصف الأول</SelectItem>
                      <SelectItem value="second">الصف الثاني</SelectItem>
                      <SelectItem value="third">الصف الثالث</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sectionFilter} onValueChange={setSectionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأقسام</SelectItem>
                      <SelectItem value="scientific">علمي</SelectItem>
                      <SelectItem value="literary">أدبي</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    onClick={fetchSubscriptionsByFilters}
                    disabled={loadingSubscriptions}
                  >
                    {loadingSubscriptions ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    تحديث
                  </Button>
                </div>

                {/* Subscriptions Table */}
                {loadingSubscriptions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : subscriptions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    لا يوجد مشتركين في هذا التصنيف
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الطالب</TableHead>
                          <TableHead>كود الطالب</TableHead>
                          <TableHead>المادة</TableHead>
                          <TableHead>تاريخ الانتهاء</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptions.map((sub) => {
                          const daysRemaining = getDaysRemaining(sub.end_date);
                          const isExpired = daysRemaining <= 0;

                          return (
                            <TableRow key={sub.id}>
                              <TableCell className="font-medium">
                                {sub.profiles?.full_name || "غير معروف"}
                              </TableCell>
                              <TableCell>
                                {sub.profiles?.student_code || "-"}
                              </TableCell>
                              <TableCell>{sub.subjects?.name || "غير معروف"}</TableCell>
                              <TableCell>{formatDate(sub.end_date)}</TableCell>
                              <TableCell>
                                {isExpired ? (
                                  <Badge variant="destructive">منتهي</Badge>
                                ) : daysRemaining <= 7 ? (
                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                    {daysRemaining} يوم متبقي
                                  </Badge>
                                ) : (
                                  <Badge variant="default" className="bg-green-100 text-green-800">
                                    نشط ({daysRemaining} يوم)
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Status Search Tab */}
          <TabsContent value="status" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  بحث حالة الاشتراك
                </CardTitle>
                <CardDescription>
                  ابحث بكود الطالب لعرض حالة اشتراكاته
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="أدخل كود الطالب..."
                      value={statusSearchQuery}
                      onChange={(e) => setStatusSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchSubscriptionStatus()}
                      className="pr-10"
                    />
                  </div>
                  <Button onClick={searchSubscriptionStatus} disabled={isStatusSearching}>
                    {isStatusSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "بحث"
                    )}
                  </Button>
                </div>

                {statusSearchResult && (
                  <div className="space-y-4">
                    {/* Student Info */}
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                            <GraduationCap className="h-6 w-6 text-primary-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold">
                              {statusSearchResult.student.full_name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              كود: {statusSearchResult.student.student_code || "غير محدد"} •{" "}
                              {formatStage(statusSearchResult.student.stage)} • {formatGrade(statusSearchResult.student.grade)}
                              {statusSearchResult.student.section &&
                                ` • ${formatSection(statusSearchResult.student.section)}`}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Subscriptions */}
                    {statusSearchResult.subscriptions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        لا توجد اشتراكات لهذا الطالب
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {statusSearchResult.subscriptions.map((sub) => {
                          const daysRemaining = getDaysRemaining(sub.end_date);
                          const isExpired = daysRemaining <= 0;

                          return (
                            <Card key={sub.id}>
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <BookOpen className="h-5 w-5 text-primary" />
                                    <div>
                                      <p className="font-medium">
                                        {sub.subjects?.name || "مادة غير معروفة"}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {formatStage(sub.subjects?.stage || "")} - {formatGrade(sub.subjects?.grade || "")}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-left">
                                    <div className="flex items-center gap-2">
                                      {isExpired ? (
                                        <Badge variant="destructive">منتهي</Badge>
                                      ) : (
                                        <Badge
                                          variant="default"
                                          className="bg-green-100 text-green-800"
                                        >
                                          نشط
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      من {formatDate(sub.start_date)} إلى{" "}
                                      {formatDate(sub.end_date)}
                                    </p>
                                    {!isExpired && (
                                      <p className="text-xs font-medium text-primary mt-1">
                                        {daysRemaining} يوم متبقي
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Subscription Messages Tab */}
          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  إعدادات رسائل الاشتراك
                </CardTitle>
                <CardDescription>
                  تخصيص رسالة الاشتراك لكل مرحلة وصف ومادة
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Selection Form */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>المرحلة</Label>
                    <Select value={msgStage} onValueChange={setMsgStage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preparatory">إعدادي</SelectItem>
                        <SelectItem value="secondary">ثانوي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>الصف</Label>
                    <Select value={msgGrade} onValueChange={setMsgGrade}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first">الأول</SelectItem>
                        <SelectItem value="second">الثاني</SelectItem>
                        <SelectItem value="third">الثالث</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {msgStage === "secondary" && (
                    <div className="space-y-2">
                      <Label>القسم</Label>
                      <Select value={msgSection} onValueChange={setMsgSection}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر القسم" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scientific">علمي</SelectItem>
                          <SelectItem value="literary">أدبي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>المادة</Label>
                    <Select value={msgCategory} onValueChange={setMsgCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getCategoriesForStudent(msgStage, msgSection).map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Message Form */}
                <div className="space-y-4 p-4 rounded-lg bg-accent/50">
                  <div className="space-y-2">
                    <Label>رسالة الترحيب</Label>
                    <Textarea
                      value={currentMessage.welcome_message}
                      onChange={(e) =>
                        setCurrentMessage({ ...currentMessage, welcome_message: e.target.value })
                      }
                      placeholder="مرحباً بك! اشترك الآن للوصول لجميع المحتوى..."
                      rows={4}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>سعر الاشتراك</Label>
                      <Input
                        value={currentMessage.price}
                        onChange={(e) =>
                          setCurrentMessage({ ...currentMessage, price: e.target.value })
                        }
                        placeholder="100"
                        type="number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>العملة</Label>
                      <Input value={settings.currency} disabled />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>ما يشمله الاشتراك</Label>
                    <Input
                      value={currentMessage.includes_description}
                      onChange={(e) =>
                        setCurrentMessage({ ...currentMessage, includes_description: e.target.value })
                      }
                      placeholder="نحو + بلاغة + أدب + نصوص"
                    />
                  </div>

                  <Button onClick={saveSubscriptionMessage} disabled={isSavingMessage} className="w-full">
                    {isSavingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Save className="h-4 w-4 ml-2" />
                    )}
                    حفظ رسالة الاشتراك
                  </Button>
                </div>

                {/* Preview */}
                <Card className="bg-gradient-to-br from-primary/10 to-gold/10 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-sm">معاينة الرسالة</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="whitespace-pre-wrap text-sm">{currentMessage.welcome_message}</p>
                    <div className="flex items-center gap-2 text-lg font-bold text-primary">
                      <span>{currentMessage.price}</span>
                      <span className="text-sm">{settings.currency}</span>
                    </div>
                    {currentMessage.includes_description && (
                      <p className="text-xs text-muted-foreground">
                        يشمل: {currentMessage.includes_description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  إعدادات واتساب العامة
                </CardTitle>
                <CardDescription>
                  رسالة واتساب الموحدة عند الضغط على زر الاشتراك
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>رقم واتساب للتواصل</Label>
                    <Input
                      value={settings.whatsapp}
                      onChange={(e) =>
                        setSettings({ ...settings, whatsapp: e.target.value })
                      }
                      placeholder="01223909712"
                      dir="ltr"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>سعر الاشتراك الافتراضي</Label>
                      <Input
                        value={settings.price}
                        onChange={(e) =>
                          setSettings({ ...settings, price: e.target.value })
                        }
                        placeholder="100"
                        type="number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>العملة</Label>
                      <Input
                        value={settings.currency}
                        onChange={(e) =>
                          setSettings({ ...settings, currency: e.target.value })
                        }
                        placeholder="جنيه"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>رسالة واتساب الافتراضية</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      المتغيرات المتاحة: {"{subject}"} - {"{grade}"} - {"{stage}"} -{" "}
                      {"{section}"} - {"{student_id}"}
                    </p>
                    <Textarea
                      value={settings.message}
                      onChange={(e) =>
                        setSettings({ ...settings, message: e.target.value })
                      }
                      placeholder={`مرحبًا، أريد الاشتراك في:
المادة: {subject}
الصف: {grade}
المرحلة: {stage}
القسم: {section}
ID الطالب: {student_id}`}
                      rows={6}
                    />
                  </div>
                </div>

                <Button
                  onClick={saveSettings}
                  disabled={isSavingSettings}
                  className="w-full"
                >
                  {isSavingSettings ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 ml-2" />
                  )}
                  حفظ الإعدادات
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SubscriptionsPage;
