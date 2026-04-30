import { useNavigate, useParams } from "react-router-dom";
import AdminTeacherFullView from "@/components/admin/AdminTeacherFullDialog";

export default function AdminTeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();

  return (
    <AdminTeacherFullView
      teacherId={teacherId || null}
      onBack={() => navigate("/admin")}
    />
  );
}
