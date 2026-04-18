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
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import CompleteProfile from "@/pages/CompleteProfile";
import Dashboard from "@/pages/Dashboard";
import Subjects from "@/pages/Subjects";
import SubjectPage from "@/pages/SubjectPage";
import TeacherSelection from "@/pages/student/TeacherSelection";
import AdminDashboard from "@/pages/AdminDashboard";
import TeacherSubjectPage from "@/pages/TeacherSubjectPage";
import TeacherUploadContent from "@/pages/teacher/TeacherUploadContent";
import TeacherSubSubjectView from "@/pages/teacher/TeacherSubSubjectView";
import TeacherRegister from "@/pages/TeacherRegister";
import PendingApproval from "@/pages/PendingApproval";
import ProfileSettings from "@/pages/ProfileSettings";
import SubjectAiChat from "@/pages/SubjectAiChat";
import StudentExamPage from "@/pages/StudentExamPage";
import About from "@/pages/About";
import AboutPage from "@/pages/student/AboutPage";
import EducationTypeSelection from "@/pages/EducationTypeSelection";
import SupportPage from "@/pages/student/SupportPage";
import WalletPage from "@/pages/student/WalletPage";
import StudentSubjectView from "@/pages/student/StudentSubjectView";
import StudentNotificationsPage from "@/pages/student/NotificationsPage";
import StudentProfilePage from "@/pages/student/StudentProfilePage";
import StudentProgressPage from "@/pages/student/StudentProgressPage";
import MyCoursesPage from "@/pages/student/MyCoursesPage";
import MyLibraryPage from "@/pages/student/MyLibraryPage";
import LibraryBookStudio from "@/pages/student/LibraryBookStudio";
import CategorySubjectsPage from "@/pages/student/CategorySubjectsPage";

import NotFound from "@/pages/NotFound";

// Admin pages
import SubscriptionsPage from "@/pages/admin/SubscriptionsPage";
import AdminUploadBrowser from "@/pages/admin/AdminUploadBrowser";
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

// Teacher pages (new 2026)
import TeacherHomePage from "@/pages/teacher/TeacherHomePage";
import TeacherAssistantPage from "@/pages/teacher/TeacherAssistantPage";
import TeacherGradeDashboard from "@/pages/teacher/TeacherGradeDashboard";
import TeacherSubjectsPage from "@/pages/teacher/TeacherSubjectsPage";
import TeacherStudentsPage from "@/pages/teacher/TeacherStudentsPage";
import TeacherMessagesPage from "@/pages/teacher/TeacherMessagesPage";
import TeacherWalletPage from "@/pages/teacher/TeacherWalletPage";
import TeacherProfilePage from "@/pages/teacher/TeacherProfilePage";
import TeacherSettingsPage from "@/pages/teacher/TeacherSettingsPage";
import TeacherNotificationsPage from "@/pages/teacher/TeacherNotificationsPage";
import TeacherStudentManagement from "@/pages/teacher/TeacherStudentManagement";
import TeacherEditProfilePage from "@/pages/teacher/TeacherEditProfilePage";
import TeacherAccountInfoPage from "@/pages/teacher/TeacherAccountInfoPage";
import TeacherSecurityPage from "@/pages/teacher/TeacherSecurityPage";
import TeacherSupportSettingsPage from "@/pages/teacher/TeacherSupportSettingsPage";
import StudentSecurityPage from "@/pages/student/StudentSecurityPage";

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
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />
              <Route path="/about" element={<About />} />
              <Route path="/teacher-register" element={<TeacherRegister />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/select-education-type" element={<ProtectedRoute allowedRoles={["student"]}><EducationTypeSelection /></ProtectedRoute>} />

              {/* Student */}
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["student"]}><Dashboard /></ProtectedRoute>} />
              <Route path="/subjects" element={<ProtectedRoute allowedRoles={["student"]}><Subjects /></ProtectedRoute>} />
              <Route path="/subject/:subjectId" element={<ProtectedRoute allowedRoles={["student"]}><SubjectPage /></ProtectedRoute>} />
              <Route path="/teacher-selection" element={<ProtectedRoute allowedRoles={["student"]}><TeacherSelection /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
              <Route path="/subject-ai-chat" element={<ProtectedRoute allowedRoles={["student"]}><SubjectAiChat /></ProtectedRoute>} />
              <Route path="/student-exam" element={<ProtectedRoute allowedRoles={["student"]}><StudentExamPage /></ProtectedRoute>} />
              <Route path="/about-platform" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute allowedRoles={["student"]}><WalletPage /></ProtectedRoute>} />
              <Route path="/student-subject" element={<ProtectedRoute allowedRoles={["student"]}><StudentSubjectView /></ProtectedRoute>} />
              <Route path="/student-profile" element={<ProtectedRoute allowedRoles={["student"]}><StudentProfilePage /></ProtectedRoute>} />
              <Route path="/student-progress" element={<ProtectedRoute allowedRoles={["student"]}><StudentProgressPage /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute allowedRoles={["student"]}><StudentNotificationsPage /></ProtectedRoute>} />
              <Route path="/my-courses" element={<ProtectedRoute allowedRoles={["student"]}><MyCoursesPage /></ProtectedRoute>} />
              <Route path="/my-library" element={<ProtectedRoute allowedRoles={["student"]}><MyLibraryPage /></ProtectedRoute>} />
              <Route path="/my-library/book/:bookId" element={<ProtectedRoute allowedRoles={["student"]}><LibraryBookStudio /></ProtectedRoute>} />
              <Route path="/category-subjects" element={<ProtectedRoute allowedRoles={["student"]}><CategorySubjectsPage /></ProtectedRoute>} />
              <Route path="/student-security" element={<ProtectedRoute allowedRoles={["student"]}><StudentSecurityPage /></ProtectedRoute>} />
              {/* Teacher (new 2026 layout) */}
              <Route path="/teacher" element={<TeacherProtectedRoute><TeacherHomePage /></TeacherProtectedRoute>} />
              <Route path="/teacher/grade" element={<TeacherProtectedRoute><TeacherGradeDashboard /></TeacherProtectedRoute>} />
              <Route path="/teacher/subjects" element={<TeacherProtectedRoute><TeacherSubjectsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/students" element={<TeacherProtectedRoute><TeacherStudentsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/messages" element={<TeacherProtectedRoute><TeacherMessagesPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/wallet" element={<TeacherProtectedRoute><TeacherWalletPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/profile" element={<TeacherProtectedRoute><TeacherProfilePage /></TeacherProtectedRoute>} />
              <Route path="/teacher/settings" element={<TeacherProtectedRoute><TeacherSettingsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/notifications" element={<TeacherProtectedRoute><TeacherNotificationsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/subject" element={<TeacherProtectedRoute><TeacherSubjectPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/upload/:subjectId" element={<TeacherProtectedRoute><TeacherUploadContent /></TeacherProtectedRoute>} />
              <Route path="/teacher/upload/subject/:subjectId" element={<TeacherProtectedRoute><TeacherUploadContent /></TeacherProtectedRoute>} />
              <Route path="/teacher/sub-subjects/:subjectId" element={<TeacherProtectedRoute><TeacherSubSubjectView /></TeacherProtectedRoute>} />
              <Route path="/teacher/student-management" element={<TeacherProtectedRoute><TeacherStudentManagement /></TeacherProtectedRoute>} />
              <Route path="/teacher/assistant" element={<TeacherProtectedRoute><TeacherAssistantPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/edit-profile" element={<TeacherProtectedRoute><TeacherEditProfilePage /></TeacherProtectedRoute>} />
              <Route path="/teacher/settings/account" element={<TeacherProtectedRoute><TeacherAccountInfoPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/settings/security" element={<TeacherProtectedRoute><TeacherSecurityPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/settings/support" element={<TeacherProtectedRoute><TeacherSupportSettingsPage /></TeacherProtectedRoute>} />

              {/* Admin */}
              <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/subscriptions" element={<ProtectedRoute allowedRoles={["admin"]}><SubscriptionsPage /></ProtectedRoute>} />
              <Route path="/admin/upload" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadBrowser /></ProtectedRoute>} />
              <Route path="/admin/upload/content" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/upload/content/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/upload/sub-subjects/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><TeacherSubSubjectView /></ProtectedRoute>} />
              <Route path="/admin/upload/subject/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><TeacherUploadContent /></ProtectedRoute>} />
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
