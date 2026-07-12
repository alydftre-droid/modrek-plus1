import { useNavigate } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import { Card } from "@/components/ui/card";
import { BookOpen, ClipboardList, Sparkles, ArrowLeft } from "lucide-react";

export default function ModrekAiHome() {
  const navigate = useNavigate();
  const cards = [
    {
      id: "study",
      title: "المساعد الدراسي",
      description: "شرح الدروس، حل المسائل، شرح الصور وملفات PDF، تلخيص، وإنشاء تدريبات.",
      icon: BookOpen,
      gradient: "from-blue-500 via-indigo-500 to-purple-600",
      path: "/ai/study",
    },
    {
      id: "exams",
      title: "مساعد الامتحانات",
      description: "أنشئ امتحانات وتدريبات واختبارات مراجعة فورًا بأسلوبك ومستوى منهجك.",
      icon: ClipboardList,
      gradient: "from-emerald-500 via-teal-500 to-cyan-600",
      path: "/ai/exams",
    },
  ];

  return (
    <StudentLayout title="Modrek AI">
      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> نظام الذكاء الاصطناعي الجديد
          </div>
          <h1 className="text-2xl md:text-3xl font-black">اختر المساعد المناسب لك</h1>
          <p className="text-muted-foreground text-sm">
            كل مساعد يعرف مرحلتك وصفك ونظامك ومنهجك تلقائيًا.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Card
                key={c.id}
                onClick={() => navigate(c.path)}
                className="cursor-pointer overflow-hidden group hover:shadow-xl transition-all active:scale-[0.98]"
              >
                <div className={`bg-gradient-to-br ${c.gradient} p-6 text-white`}>
                  <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <Icon className="h-7 w-7" />
                    </div>
                    <ArrowLeft className="h-5 w-5 opacity-70 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <h2 className="mt-4 text-xl font-black">{c.title}</h2>
                  <p className="mt-2 text-sm text-white/90 leading-relaxed">{c.description}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </StudentLayout>
  );
}
