import { Lock, MessageCircle, Sparkles, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PaywallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName: string;
  grade: string;
  stage: string;
  section?: string | null;
  studentId: string;
  studentCode?: string | null;
  teacherName?: string | null;
  // New group props
  groupTitle?: string;
  groupPrice?: number;
}

const PaywallDialog = ({
  open,
  onOpenChange,
  subjectName,
  grade,
  stage,
  section,
  studentId,
  studentCode,
  teacherName,
  groupTitle,
  groupPrice,
}: PaywallDialogProps) => {
  const [settings, setSettings] = useState({
    whatsapp: "01223909712",
    price: "100",
    currency: "جنيه",
    message: "",
  });

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
          whatsapp: settingsMap.subscription_whatsapp || "01223909712",
          price: settingsMap.subscription_default_price || "100",
          currency: settingsMap.subscription_currency || "جنيه",
          message: settingsMap.subscription_default_message || "",
        });
      }
    };

    if (open) fetchSettings();
  }, [open]);

  const formatStage = (s: string) => {
    if (s === "preparatory") return "المرحلة الإعدادية";
    if (s === "secondary") return "المرحلة الثانوية";
    return s;
  };

  const formatGrade = (g: string) => {
    if (g === "first") return "الصف الأول";
    if (g === "second") return "الصف الثاني";
    if (g === "third") return "الصف الثالث";
    return g;
  };

  const formatSection = (sec: string | null | undefined) => {
    if (sec === "scientific") return "علمي";
    if (sec === "literary") return "أدبي";
    return sec || "";
  };

  const displayPrice = groupPrice !== undefined ? String(groupPrice) : settings.price;
  const displayTitle = groupTitle || subjectName;

  const handleSubscribe = () => {
    let message = settings.message || `مرحبًا، أريد الاشتراك في:
المادة: {subject}
المجموعة: {group}
الصف: {grade}
المرحلة: {stage}
القسم: {section}
المعلم: {teacher}
ID الطالب: {student_id}`;

    message = message
      .replace("{subject}", subjectName)
      .replace("{group}", groupTitle || "غير محدد")
      .replace("{grade}", formatGrade(grade))
      .replace("{stage}", formatStage(stage))
      .replace("{section}", formatSection(section) || "غير محدد")
      .replace("{teacher}", teacherName || "غير محدد")
      .replace("{student_id}", studentCode || studentId.substring(0, 8));

    const encodedMessage = encodeURIComponent(message);
    const whatsappNumber = settings.whatsapp.replace(/[^0-9]/g, "");
    const whatsappUrl = `https://wa.me/${whatsappNumber.startsWith("0") ? "2" + whatsappNumber : whatsappNumber}?text=${encodedMessage}`;

    window.open(whatsappUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Crown className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">محتوى مدفوع</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {groupTitle ? `هذه المجموعة "${groupTitle}" متاحة للمشتركين فقط` : "هذا المحتوى متاح فقط للمشتركين"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm">وصول كامل لجميع الدروس والفيديوهات</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm">تحميل الكتب والملخصات</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm">امتحانات ومراجعات حصرية</span>
            </div>
          </div>

          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-1">سعر الاشتراك</p>
            <p className="text-3xl font-bold text-primary">
              {displayPrice} <span className="text-lg">{settings.currency}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {groupTitle ? `للمجموعة: ${groupTitle}` : "للمادة الواحدة"}
            </p>
          </div>

          <div className="text-center text-sm text-muted-foreground space-y-1">
            <p>المادة: <span className="font-semibold text-foreground">{subjectName}</span></p>
            {groupTitle && <p>المجموعة: <span className="font-semibold text-foreground">{groupTitle}</span></p>}
            <p>
              {formatStage(stage)} - {formatGrade(grade)}
              {section && ` - ${formatSection(section)}`}
            </p>
          </div>

          <Button
            onClick={handleSubscribe}
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            <MessageCircle className="h-5 w-5" />
            اشترك الآن عبر واتساب
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            سيتم تحويلك إلى واتساب للتواصل معنا وإتمام عملية الاشتراك
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaywallDialog;

