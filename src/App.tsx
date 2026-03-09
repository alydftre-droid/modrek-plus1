import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import ProtectedRoute from "@/components/ProtectedRoute";
import TeacherProtectedRoute from "@/routes/TeacherProtectedRoute";

// Pages
import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Subjects from "@/pages/Subjects";
import SubjectPage from "@/pages/SubjectPage";
import TeacherSelection from "@/pages/student/TeacherSelection";
import AdminDashboard from "@/pages/AdminDashboard";
import TeacherDashboard from "@/pages/TeacherDashboard";
import TeacherSubjectPage from "@/pages/TeacherSubjectPage";
import TeacherUploadContent from "@/pages/teacher/TeacherUploadContent";
import TeacherSubSubjectView from "@/pages/teacher/TeacherSubSubjectView";
import TeacherRegister from "@/pages/TeacherRegister";
import PendingApproval from "@/pages/PendingApproval";
import ProfileSettings from "@/pages/ProfileSettings";
// AiChat removed from main routes - only inside subjects
import SubjectAiChat from "@/pages/SubjectAiChat";
import StudentExamPage from "@/pages/StudentExamPage";
import About from "@/pages/About";
import AboutPage from "@/pages/student/AboutPage";
import SupportPage from "@/pages/student/SupportPage";
import WalletPage from "@/pages/student/WalletPage";
import StudentSubjectView from "@/pages/student/StudentSubjectView";
import StudentNotificationsPage from "@/pages/student/NotificationsPage";
import StudentProfilePage from "@/pages/student/StudentProfilePage";
import NotFound from "@/pages/NotFound";

// Admin pages
import SubscriptionsPage from "@/pages/admin/SubscriptionsPage";
import AdminUploadBrowser from "@/pages/admin/AdminUploadBrowser";
import AdminUploadSubjects from "@/pages/admin/AdminUploadSubjects";
import AdminUploadSubjectContent from "@/pages/admin/AdminUploadSubjectContent";
import AdminSubjectsList from "@/pages/admin/AdminSubjectsList";
import AdminSubjectContent from "@/pages/admin/AdminSubjectContent";
import ContentPage from "@/pages/admin/ContentPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import StudentsPage from "@/pages/admin/StudentsPage";
import SubjectsPage from "@/pages/admin/SubjectsPage";
import TeachersPage from "@/pages/admin/TeachersPage";
import AdminSupportPage from "@/pages/admin/SupportPage";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/about" element={<About />} />
              <Route path="/teacher-register" element={<TeacherRegister />} />
              <Route path="/pending-approval" element={<PendingApproval />} />

              {/* Student */}
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["student"]}><Dashboard /></ProtectedRoute>} />
              <Route path="/subjects" element={<ProtectedRoute allowedRoles={["student"]}><Subjects /></ProtectedRoute>} />
              <Route path="/subject/:subjectId" element={<ProtectedRoute allowedRoles={["student"]}><SubjectPage /></ProtectedRoute>} />
              <Route path="/teacher-selection" element={<ProtectedRoute allowedRoles={["student"]}><TeacherSelection /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
              {/* AI chat removed from main - only available inside subjects */}
              <Route path="/subject-ai-chat" element={<ProtectedRoute allowedRoles={["student"]}><SubjectAiChat /></ProtectedRoute>} />
              <Route path="/student-exam" element={<ProtectedRoute allowedRoles={["student"]}><StudentExamPage /></ProtectedRoute>} />
              <Route path="/about-platform" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute allowedRoles={["student"]}><WalletPage /></ProtectedRoute>} />
              <Route path="/student-subject" element={<ProtectedRoute allowedRoles={["student"]}><StudentSubjectView /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute allowedRoles={["student"]}><StudentNotificationsPage /></ProtectedRoute>} />

              {/* Teacher */}
              <Route path="/teacher" element={<TeacherProtectedRoute><TeacherDashboard /></TeacherProtectedRoute>} />
              <Route path="/teacher/subject" element={<TeacherProtectedRoute><TeacherSubjectPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/upload/:subjectId" element={<TeacherProtectedRoute><TeacherUploadContent /></TeacherProtectedRoute>} />
              <Route path="/teacher/upload/subject/:subjectId" element={<TeacherProtectedRoute><TeacherUploadContent /></TeacherProtectedRoute>} />
              <Route path="/teacher/sub-subjects/:subjectId" element={<TeacherProtectedRoute><TeacherSubSubjectView /></TeacherProtectedRoute>} />

              {/* Admin */}
              <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/subscriptions" element={<ProtectedRoute allowedRoles={["admin"]}><SubscriptionsPage /></ProtectedRoute>} />
              <Route path="/admin/upload" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadBrowser /></ProtectedRoute>} />
              <Route path="/admin/upload/subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjects /></ProtectedRoute>} />
              <Route path="/admin/upload/content" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/upload/content/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectsList /></ProtectedRoute>} />
              <Route path="/admin/subjects/content" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/content" element={<ProtectedRoute allowedRoles={["admin"]}><ContentPage /></ProtectedRoute>} />
              <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={["admin"]}><NotificationsPage /></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>} />
              <Route path="/admin/students" element={<ProtectedRoute allowedRoles={["admin"]}><StudentsPage /></ProtectedRoute>} />
              <Route path="/admin/subjects-page" element={<ProtectedRoute allowedRoles={["admin"]}><SubjectsPage /></ProtectedRoute>} />
              <Route path="/admin/teachers" element={<ProtectedRoute allowedRoles={["admin"]}><TeachersPage /></ProtectedRoute>} />
              <Route path="/admin/support" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSupportPage /></ProtectedRoute>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
          <ShadcnToaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
