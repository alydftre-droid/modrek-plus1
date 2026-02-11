import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";

/* 🌍 Public Pages */
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import TeacherRegister from "./pages/TeacherRegister";

/* 🎓 Student Pages */
import Dashboard from "./pages/Dashboard";
import Subjects from "./pages/Subjects";
import SubjectPage from "./pages/SubjectPage";
import SubjectAiChat from "./pages/SubjectAiChat";
import AiChat from "./pages/AiChat";
import StudentSupportPage from "./pages/student/SupportPage";
import StudentAboutPage from "./pages/student/AboutPage";
import TeacherSelection from "./pages/student/TeacherSelection";
import ProfileSettings from "./pages/ProfileSettings";

/* 👨‍🏫 Teacher Pages */
import TeacherDashboard from "./pages/TeacherDashboard";
import PendingApproval from "./pages/PendingApproval";
import TeacherProtectedRoute from "./routes/TeacherProtectedRoute";
import TeacherSubjectPage from "./pages/TeacherSubjectPage";
import TeacherUploadContent from "./pages/teacher/TeacherUploadContent";

/* 🛠 Admin Pages */
import AdminDashboard from "./pages/AdminDashboard";
import AdminStudentsPage from "./pages/admin/StudentsPage";
import AdminTeachersPage from "./pages/admin/TeachersPage";
import AdminContentPage from "./pages/admin/ContentPage";
import AdminSubjectsPage from "./pages/admin/SubjectsPage";
import AdminNotificationsPage from "./pages/admin/NotificationsPage";
import AdminSettingsPage from "./pages/admin/SettingsPage";
import AdminSupportPage from "./pages/admin/SupportPage";
import AdminContentBrowser from "./pages/admin/AdminContentBrowser";
import AdminSubjectsList from "./pages/admin/AdminSubjectsList";
import AdminSubjectContent from "./pages/admin/AdminSubjectContent";
import AdminUploadBrowser from "./pages/admin/AdminUploadBrowser";
import AdminUploadSubjects from "./pages/admin/AdminUploadSubjects";
import AdminUploadSubjectContent from "./pages/admin/AdminUploadSubjectContent";
import AdminSubscriptionsPage from "./pages/admin/SubscriptionsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/about" element={<About />} />
            <Route path="/teacher-register" element={<TeacherRegister />} />

            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["student", "admin"]}><Dashboard /></ProtectedRoute>} />
            <Route path="/profile-settings" element={<ProtectedRoute requireAuth><ProfileSettings /></ProtectedRoute>} />
            <Route path="/subjects" element={<ProtectedRoute allowedRoles={["student", "admin"]}><Subjects /></ProtectedRoute>} />
            <Route path="/subject/:subjectId" element={<ProtectedRoute allowedRoles={["student", "admin"]}><SubjectPage /></ProtectedRoute>} />
            <Route path="/subject/:subjectId/ai-chat" element={<ProtectedRoute allowedRoles={["student", "admin"]}><SubjectAiChat /></ProtectedRoute>} />
            <Route path="/ai-chat" element={<ProtectedRoute allowedRoles={["student", "admin"]}><AiChat /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute allowedRoles={["student", "admin"]}><StudentSupportPage /></ProtectedRoute>} />
            <Route path="/about-platform" element={<ProtectedRoute allowedRoles={["student", "admin"]}><StudentAboutPage /></ProtectedRoute>} />
            <Route path="/select-teacher" element={<ProtectedRoute allowedRoles={["student", "admin"]}><TeacherSelection /></ProtectedRoute>} />

            <Route path="/teacher" element={<TeacherProtectedRoute><TeacherDashboard /></TeacherProtectedRoute>} />
            <Route path="/teacher/subject" element={<TeacherProtectedRoute><TeacherSubjectPage /></TeacherProtectedRoute>} />
            <Route path="/teacher/upload/subject/:subjectId" element={<TeacherProtectedRoute><TeacherUploadContent /></TeacherProtectedRoute>} />
            <Route path="/pending-approval" element={<ProtectedRoute requireAuth><PendingApproval /></ProtectedRoute>} />

            <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute allowedRoles={["admin"]}><AdminStudentsPage /></ProtectedRoute>} />
            <Route path="/admin/teachers" element={<ProtectedRoute allowedRoles={["admin"]}><AdminTeachersPage /></ProtectedRoute>} />
            <Route path="/admin/content" element={<ProtectedRoute allowedRoles={["admin"]}><AdminContentPage /></ProtectedRoute>} />
            <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectsPage /></ProtectedRoute>} />
            <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={["admin"]}><AdminNotificationsPage /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSettingsPage /></ProtectedRoute>} />
            <Route path="/admin/support" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSupportPage /></ProtectedRoute>} />
            <Route path="/admin/content-browser" element={<ProtectedRoute allowedRoles={["admin"]}><AdminContentBrowser /></ProtectedRoute>} />
            <Route path="/admin/content-browser/subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectsList /></ProtectedRoute>} />
            <Route path="/admin/content-browser/subject/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectContent /></ProtectedRoute>} />
            <Route path="/admin/upload" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadBrowser /></ProtectedRoute>} />
            <Route path="/admin/upload/subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjects /></ProtectedRoute>} />
            <Route path="/admin/upload/subject/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
            <Route path="/admin/subscriptions" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubscriptionsPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;


