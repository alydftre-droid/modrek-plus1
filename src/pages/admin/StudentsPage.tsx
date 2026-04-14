import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Ban,
  CheckCircle,
  Eye,
  Loader2,
  User,
  Mail,
  Phone,
  Calendar,
  Hash,
} from "lucide-react";

type Student = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  is_banned: boolean | null;
  created_at: string | null;
};

const StudentsPage = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error("Error loading students:", error);
      toast.error("خطأ في تحميل بيانات الطلاب");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const handleBanToggle = async (student: Student) => {
    setActionLoading(true);
    try {
      const newBannedStatus = !student.is_banned;
      const { error } = await supabase
        .from("profiles")
        .update({ is_banned: newBannedStatus })
        .eq("id", student.id);

      if (error) throw error;

      toast.success(newBannedStatus ? "تم حظر الطالب" : "تم إلغاء حظر الطالب");
      loadStudents();
      setShowDetails(false);
    } catch (error) {
      console.error("Error updating ban status:", error);
      toast.error("خطأ في تحديث حالة الحظر");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.student_code && s.student_code.includes(searchTerm))
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              إدارة الطلاب ({students.length})
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو البريد أو الكود..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {searchTerm ? "لا توجد نتائج للبحث" : "لا يوجد طلاب مسجلين"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">المرحلة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ التسجيل</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.full_name}</TableCell>
                      <TableCell>{student.email}</TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {student.student_code || "-"}
                        </code>
                      </TableCell>
                      <TableCell>
                        {student.stage && student.grade ? (
                          <span>{student.stage} - {student.grade}</span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {student.is_banned ? (
                          <Badge variant="destructive">محظور</Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-500 text-green-600">نشط</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(student.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedStudent(student);
                              setShowDetails(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleBanToggle(student)}
                            className={student.is_banned ? "text-green-600" : "text-destructive"}
                          >
                            {student.is_banned ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog تفاصيل الطالب */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل الطالب</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg">{selectedStudent.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedStudent.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">كود الطالب</p>
                    <p className="font-medium">{selectedStudent.student_code || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">الهاتف</p>
                    <p className="font-medium">{selectedStudent.phone || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">تاريخ التسجيل</p>
                    <p className="font-medium">{formatDate(selectedStudent.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">المرحلة</p>
                    <p className="font-medium">
                      {selectedStudent.stage || "-"} {selectedStudent.grade || ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span>حالة الحساب</span>
                {selectedStudent.is_banned ? (
                  <Badge variant="destructive">محظور</Badge>
                ) : (
                  <Badge variant="outline" className="border-green-500 text-green-600">نشط</Badge>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedStudent && (
              <Button
                variant={selectedStudent.is_banned ? "default" : "destructive"}
                onClick={() => handleBanToggle(selectedStudent)}
                disabled={actionLoading}
                className="w-full"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                {selectedStudent.is_banned ? "إلغاء الحظر" : "حظر الطالب"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentsPage;
