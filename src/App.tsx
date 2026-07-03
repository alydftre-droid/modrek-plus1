import { useEffect, useLayoutEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import ProtectedRoute from "@/components/ProtectedRoute";
import TeacherProtectedRoute from "@/routes/TeacherProtectedRoute";
import PageTransition from "@/components/PageTransition";
import AppSplash from "@/components/AppSplash";
import ScrollToTop from "@/components/ScrollToTop";
import RouteActivityTracker from "@/components/RouteActivityTracker";
import AppUpdateDialog from "@/components/AppUpdateDialog";
import { useLocation } from "react-router-dom";
import "@/styles/admin-ds-overrides.css";
import "@/styles/student-ds-overrides.css";
import "@/styles/teacher-ds-overrides.css";

// Pages
import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";

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
import AiChat from "@/pages/AiChat";
import SubjectAiChat from "@/pages/SubjectAiChat";
// New exams system pages
import ExamsListPage from "@/pages/student/ExamsListPage";
import ExamDetailPage from "@/pages/student/ExamDetailPage";
import ExamTakePage from "@/pages/student/ExamTakePage";
import ExamResultPage from "@/pages/student/ExamResultPage";
import ExamReviewPage from "@/pages/student/ExamReviewPage";
import ExamSubmitPage from "@/pages/student/ExamSubmitPage";
import ExamStatsPage from "@/pages/student/ExamStatsPage";
import ExamLeaderboardPage from "@/pages/student/ExamLeaderboardPage";
import ExamsHomePage from "@/pages/teacher/exams/ExamsHomePage";
import CreateMethodPage from "@/pages/teacher/exams/CreateMethodPage";
import AiAssistantPage from "@/pages/teacher/exams/AiAssistantPage";
import ManualBuilderPage from "@/pages/teacher/exams/ManualBuilderPage";
import ReviewQuestionsPage from "@/pages/teacher/exams/ReviewQuestionsPage";
import ExamSettingsPage from "@/pages/teacher/exams/ExamSettingsPage";
import PreviewPublishPage from "@/pages/teacher/exams/PreviewPublishPage";
import TeacherExamAttemptsPage from "@/pages/teacher/TeacherExamAttemptsPage";
import TeacherExamAnalyticsPage from "@/pages/teacher/TeacherExamAnalyticsPage";
import About from "@/pages/About";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import AboutPage from "@/pages/student/AboutPage";
import EducationTypeSelection from "@/pages/EducationTypeSelection";
import SupportPage from "@/pages/student/SupportPage";
import WalletPage from "@/pages/student/WalletPage";
import DepositPage from "@/pages/student/DepositPage";
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
import AdminCategorySubjectsPage from "@/pages/admin/AdminCategorySubjectsPage";
import AdminSubjectsList from "@/pages/admin/AdminSubjectsList";
import AdminSubjectContent from "@/pages/admin/AdminSubjectContent";
import ContentPage from "@/pages/admin/ContentPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import NotificationDetailPage from "@/pages/admin/NotificationDetailPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import StudentsPage from "@/pages/admin/StudentsPage";
import SubjectsPage from "@/pages/admin/SubjectsPage";
import TeachersPage from "@/pages/admin/TeachersPage";
import AdminTeacherDetailPage from "@/pages/admin/AdminTeacherDetailPage";
import AdminSupportPage from "@/pages/admin/SupportPage";
import DeveloperSmartReportsPage from "@/pages/admin/DeveloperSmartReportsPage";
import DeveloperTeacherDetailPage from "@/pages/admin/DeveloperTeacherDetailPage";
import DeveloperTeacherStudentsPage from "@/pages/admin/DeveloperTeacherStudentsPage";

// Teacher pages (new 2026)
import TeacherHomePage from "@/pages/teacher/TeacherHomePage";
import TeacherAssistantPage from "@/pages/teacher/TeacherAssistantPage";
import TeacherGradeDashboard from "@/pages/teacher/TeacherGradeDashboard";
import TeacherAssignmentsDiagnosticsPage from "@/pages/teacher/TeacherAssignmentsDiagnosticsPage";
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
import BundlesPage from "@/pages/student/BundlesPage";
import BundleCheckoutPage from "@/pages/student/BundleCheckoutPage";
import BundledPackagesIndex from "@/pages/admin/BundledPackages/Index";
import BundledPackagesGradesPage from "@/pages/admin/BundledPackages/GradesPage";
import BundledPackagesSectionSubjectsPage from "@/pages/admin/BundledPackages/SectionAndSubjectsPage";
import PackageEditor from "@/pages/admin/BundledPackages/PackageEditor";
import PackagesList from "@/pages/admin/BundledPackages/PackagesList";
import AdsManagement from "@/pages/admin/AdsManagement";
import ModrekLibraryPage from "@/pages/admin/ModrekLibraryPage";
import ModrekSourceDetailPage from "@/pages/admin/ModrekSourceDetailPage";
import ModrekAnalyticsPage from "@/pages/admin/ModrekAnalyticsPage";
import AdDetailPage from "@/pages/student/AdDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Keep cached data for 24h so navigating back to a page restores instantly without refetching
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: "always",
      retry: 1,
    },
  },
});

// Persist React Query cache to localStorage so leaving and returning to the app
// (or fully restarting it on Android) restores the previous data immediately,
// then revalidates in the background. Auth / mutations are NEVER persisted.
const queryPersister = (() => {
  try {
    if (typeof window === "undefined") return null;
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: "mp-rq-cache-v1",
      throttleTime: 1500,
    });
  } catch {
    return null;
  }
})();

function AnimatedRoutes() {
  return (
    <PageTransition>
      <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/complete-profile" element={<Navigate to="/select-education-type" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
              <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
              <Route path="/teacher-register" element={<TeacherRegister />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/select-education-type" element={<ProtectedRoute allowedRoles={["student"]}><EducationTypeSelection /></ProtectedRoute>} />

              {/* Student */}
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["student"]}><Dashboard /></ProtectedRoute>} />
              <Route path="/subjects" element={<ProtectedRoute allowedRoles={["student"]}><Subjects /></ProtectedRoute>} />
              <Route path="/subject/:subjectId" element={<ProtectedRoute allowedRoles={["student"]}><SubjectPage /></ProtectedRoute>} />
              <Route path="/teacher-selection" element={<ProtectedRoute allowedRoles={["student"]}><TeacherSelection /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
              <Route path="/ai-chat" element={<ProtectedRoute><AiChat /></ProtectedRoute>} />
              <Route path="/subject-ai-chat" element={<ProtectedRoute allowedRoles={["student"]}><SubjectAiChat /></ProtectedRoute>} />
              {/* New Exams System - Student */}
              <Route path="/student/exams" element={<ProtectedRoute allowedRoles={["student"]}><ExamsListPage /></ProtectedRoute>} />
              <Route path="/student/exams/stats" element={<ProtectedRoute allowedRoles={["student"]}><ExamStatsPage /></ProtectedRoute>} />
              <Route path="/student/exams/:examId" element={<ProtectedRoute allowedRoles={["student"]}><ExamDetailPage /></ProtectedRoute>} />
              <Route path="/student/exams/:examId/take" element={<ProtectedRoute allowedRoles={["student"]}><ExamTakePage /></ProtectedRoute>} />
              <Route path="/student/exams/:examId/submit" element={<ProtectedRoute allowedRoles={["student"]}><ExamSubmitPage /></ProtectedRoute>} />
              <Route path="/student/exams/:examId/result/:attemptId" element={<ProtectedRoute allowedRoles={["student"]}><ExamResultPage /></ProtectedRoute>} />
              <Route path="/student/exams/:examId/review/:attemptId" element={<ProtectedRoute allowedRoles={["student"]}><ExamReviewPage /></ProtectedRoute>} />
              <Route path="/student/exams/:examId/leaderboard" element={<ProtectedRoute allowedRoles={["student"]}><ExamLeaderboardPage /></ProtectedRoute>} />
              {/* New Exams System - Teacher */}
              <Route path="/teacher/exams" element={<TeacherProtectedRoute><ExamsHomePage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/new" element={<TeacherProtectedRoute><CreateMethodPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/new/ai" element={<TeacherProtectedRoute><AiAssistantPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/new/manual" element={<TeacherProtectedRoute><ManualBuilderPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/edit" element={<TeacherProtectedRoute><ManualBuilderPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/review" element={<TeacherProtectedRoute><ReviewQuestionsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/settings" element={<TeacherProtectedRoute><ExamSettingsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/preview" element={<TeacherProtectedRoute><PreviewPublishPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/attempts" element={<TeacherProtectedRoute><TeacherExamAttemptsPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/analytics" element={<TeacherProtectedRoute><TeacherExamAnalyticsPage /></TeacherProtectedRoute>} />
              <Route path="/student-exam" element={<Navigate to="/student/exams" replace />} />

              <Route path="/about-platform" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute allowedRoles={["student"]}><WalletPage /></ProtectedRoute>} />
              <Route path="/wallet/deposit" element={<ProtectedRoute allowedRoles={["student"]}><DepositPage /></ProtectedRoute>} />
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
              <Route path="/teacher/assignments-diagnostics" element={<TeacherProtectedRoute><TeacherAssignmentsDiagnosticsPage /></TeacherProtectedRoute>} />
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
              <Route path="/admin/upload" element={<ProtectedRoute allowedRoles={["admin"]}><Navigate to="/admin/modrek-library" replace /></ProtectedRoute>} />
              <Route path="/admin/upload/category-subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminCategorySubjectsPage /></ProtectedRoute>} />
              <Route path="/admin/upload/content" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/upload/content/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/upload/sub-subjects/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><TeacherSubSubjectView /></ProtectedRoute>} />
              <Route path="/admin/upload/subject/:subjectId" element={<ProtectedRoute allowedRoles={["admin"]}><TeacherUploadContent /></ProtectedRoute>} />
              <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectsList /></ProtectedRoute>} />
              <Route path="/admin/subjects/content" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSubjectContent /></ProtectedRoute>} />
              <Route path="/admin/content" element={<ProtectedRoute allowedRoles={["admin"]}><ContentPage /></ProtectedRoute>} />
              <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={["admin"]}><NotificationsPage /></ProtectedRoute>} />
              <Route path="/admin/notifications/:id" element={<ProtectedRoute allowedRoles={["admin"]}><NotificationDetailPage /></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>} />
              <Route path="/admin/students" element={<ProtectedRoute allowedRoles={["admin"]}><StudentsPage /></ProtectedRoute>} />
              <Route path="/admin/subjects-page" element={<ProtectedRoute allowedRoles={["admin"]}><SubjectsPage /></ProtectedRoute>} />
              <Route path="/admin/teachers" element={<ProtectedRoute allowedRoles={["admin"]}><TeachersPage /></ProtectedRoute>} />
              <Route path="/admin/teacher/:teacherId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminTeacherDetailPage /></ProtectedRoute>} />
              <Route path="/admin/support" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSupportPage /></ProtectedRoute>} />
              <Route path="/admin/smart-reports" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperSmartReportsPage /></ProtectedRoute>} />
              <Route path="/admin/developer/teacher/:teacherId" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperTeacherDetailPage /></ProtectedRoute>} />
              <Route path="/admin/developer/teacher/:teacherId/students" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperTeacherStudentsPage /></ProtectedRoute>} />

              {/* Bundled Packages - Admin */}
              <Route path="/admin/bundled-packages" element={<ProtectedRoute allowedRoles={["admin"]}><BundledPackagesIndex /></ProtectedRoute>} />
              <Route path="/admin/bundled-packages/manage" element={<ProtectedRoute allowedRoles={["admin"]}><PackagesList /></ProtectedRoute>} />
              <Route path="/admin/bundled-packages/new" element={<ProtectedRoute allowedRoles={["admin"]}><PackageEditor /></ProtectedRoute>} />
              <Route path="/admin/bundled-packages/edit/:packageId" element={<ProtectedRoute allowedRoles={["admin"]}><PackageEditor /></ProtectedRoute>} />
              <Route path="/admin/bundled-packages/:eduType" element={<ProtectedRoute allowedRoles={["admin"]}><BundledPackagesGradesPage /></ProtectedRoute>} />
              <Route path="/admin/bundled-packages/:eduType/:stage/:grade" element={<ProtectedRoute allowedRoles={["admin"]}><BundledPackagesSectionSubjectsPage /></ProtectedRoute>} />

              {/* Bundled Packages - Student */}
              <Route path="/student/bundles" element={<ProtectedRoute allowedRoles={["student"]}><BundlesPage /></ProtectedRoute>} />
              <Route path="/student/bundles/:bundleId" element={<ProtectedRoute allowedRoles={["student"]}><BundleCheckoutPage /></ProtectedRoute>} />

              {/* Ads */}
              <Route path="/ads/:id" element={<ProtectedRoute><AdDetailPage /></ProtectedRoute>} />
              <Route path="/admin/ads" element={<ProtectedRoute allowedRoles={["admin"]}><AdsManagement /></ProtectedRoute>} />
              <Route path="/admin/modrek-library" element={<ProtectedRoute allowedRoles={["admin"]}><ModrekLibraryPage /></ProtectedRoute>} />
              <Route path="/admin/modrek-library/:id" element={<ProtectedRoute allowedRoles={["admin"]}><ModrekSourceDetailPage /></ProtectedRoute>} />
              <Route path="/admin/modrek-analytics" element={<ProtectedRoute allowedRoles={["admin"]}><ModrekAnalyticsPage /></ProtectedRoute>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
        </PageTransition>
  );
}

function StartupRedirectHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== "/") return;

    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect");
    if (!redirect) return;

    const allowedRedirects = new Set(["/auth", "/privacy-policy", "/terms-of-service"]);
    if (!allowedRedirects.has(redirect)) return;

    navigate(redirect, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
}

function AdminDsScope() {
  const location = useLocation();
  useEffect(() => {
    const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
    document.body.classList.toggle("admin-ds", isAdmin);
    return () => { document.body.classList.remove("admin-ds"); };
  }, [location.pathname]);
  return null;
}

function TeacherDsScope() {
  const location = useLocation();
  useLayoutEffect(() => {
    const p = location.pathname;
    const isTeacher = p === "/teacher" || p.startsWith("/teacher/") || p === "/teacher-register";
    document.body.classList.toggle("teacher-ds", isTeacher);
    return () => { document.body.classList.remove("teacher-ds"); };
  }, [location.pathname]);
  return null;
}

// Routes that MUST NOT receive the student DS scope
const STUDENT_DS_EXCLUDE_PREFIXES = [
  "/admin",
  "/teacher",           // covers /teacher, /teacher/*, /teacher-register
  "/auth",              // /auth, /auth/callback
  "/forgot-password",
  "/reset-password",
  "/privacy-policy",
  "/privacy",
  "/terms-of-service",
  "/terms",
  "/about",
  "/pending-approval",
];

function StudentDsScope() {
  const location = useLocation();
  // Apply synchronously before paint so first-render never flashes legacy tokens
  useLayoutEffect(() => {
    const p = location.pathname;
    const isExcluded =
      p === "/" ||
      STUDENT_DS_EXCLUDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/") || p.startsWith(prefix + "?"));
    document.body.classList.toggle("student-ds", !isExcluded);
    return () => { document.body.classList.remove("student-ds"); };
  }, [location.pathname]);
  return null;
}

function App() {
  const tree = (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <BrowserRouter>
          <StartupRedirectHandler />
          <ScrollToTop />
          <RouteActivityTracker />
          <AdminDsScope />
          <TeacherDsScope />
          <StudentDsScope />
          <AppSplash />
          <AppUpdateDialog />
          <AnimatedRoutes />
        </BrowserRouter>
        <Toaster />
        <ShadcnToaster />
      </AuthProvider>
    </ThemeProvider>
  );

  if (queryPersister) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: 24 * 60 * 60_000,
          // Bust cache when the app code version changes
          buster: (import.meta as any).env?.VITE_APP_VERSION || "student-detail-live-db-20260701-v4",
          dehydrateOptions: {
            // Don't persist auth / mutation-bound queries — they must stay live
            shouldDehydrateQuery: (q) => {
              const key = JSON.stringify(q.queryKey || "");
              if (/auth|session|user|token|secret/i.test(key)) return false;
              if (/teacher-exams|teacher-exam-dashboard-stats|student-exams|student-exam-catalog|dev-student/i.test(key)) return false;
              return q.state.status === "success";
            },
          },
        }}
      >
        {tree}
      </PersistQueryClientProvider>
    );
  }

  return <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;
}

export default App;
