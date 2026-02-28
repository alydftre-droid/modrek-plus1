import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const StudentExamPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const examData = location.state;

  if (!examData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold">لا يوجد امتحان</h1>
        <Button onClick={() => navigate("/subjects")}>
          الرجوع للمواد
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">
        {examData.sectionName || "الامتحان"}
      </h1>

      <div className="space-y-4">
        {examData.questions?.map((q: any, index: number) => (
          <div key={index} className="p-4 border rounded-lg">
            <p className="font-semibold">
              {index + 1}. {q.question}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudentExamPage;
