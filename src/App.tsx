import { useEffect, useLayoutEffect, lazy, Suspense } from "react";
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
import { platformSlugFromHostname } from "@/lib/platformHost";
import { tenantCacheKey } from "@/lib/tenant";
import TenantSessionGate from "@/components/tenant/TenantSessionGate";

import AppSplash from "@/components/AppSplash";
import ScrollToTop from "@/components/ScrollToTop";
import RouteActivityTracker from "@/components/RouteActivityTracker";
import MetaPixelTracker from "@/components/MetaPixelTracker";
import TikTokPixelTracker from "@/components/TikTokPixelTracker";

import AppUpdateDialog from "@/components/AppUpdateDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PlatformProvider } from "@/hooks/usePlatform";
import PlatformBrandBar from "@/components/platform/PlatformBrandBar";
import LazyRouteBoundary from "@/components/LazyRouteBoundary";
import { isJsonSafe, shouldPersistQueryKey } from "@/lib/queryCacheGuard";
import { DATA_SCHEMA_VERSION } from "@/lib/dataIntegrity/cacheVersion";
import { useIntegrityGuard } from "@/lib/dataIntegrity/useIntegrityGuard";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import "@/styles/admin-ds-overrides.css";
import "@/styles/student-ds-overrides.css";
import "@/styles/teacher-ds-overrides.css";

// Pages
import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";

// New exams system pages

import NotFound from "@/pages/NotFound";
import SeoLandingPage from "@/pages/seo/SeoLandingPage";
import { seoPages } from "@/content/seoPages";

// Admin pages

// Teacher pages (new 2026)


// Lazy-loaded route components (Code Splitting)
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Subjects = lazy(() => import("@/pages/Subjects"));
const SubjectPage = lazy(() => import("@/pages/SubjectPage"));
const TeacherSelection = lazy(() => import("@/pages/student/TeacherSelection"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const TeacherSubjectPage = lazy(() => import("@/pages/TeacherSubjectPage"));
const TeacherUploadContent = lazy(() => import("@/pages/teacher/TeacherUploadContent"));
const TeacherSubSubjectView = lazy(() => import("@/pages/teacher/TeacherSubSubjectView"));
const TeacherRegister = lazy(() => import("@/pages/TeacherRegister"));
const TeacherTerms = lazy(() => import("@/pages/teacher/TeacherTerms"));
const PendingApproval = lazy(() => import("@/pages/PendingApproval"));
const ProfileSettings = lazy(() => import("@/pages/ProfileSettings"));
const AiChat = lazy(() => import("@/pages/AiChat"));
const SubjectAiChat = lazy(() => import("@/pages/SubjectAiChat"));
const ExamsListPage = lazy(() => import("@/pages/student/ExamsListPage"));
const ExamDetailPage = lazy(() => import("@/pages/student/ExamDetailPage"));
const ExamTakePage = lazy(() => import("@/pages/student/ExamTakePage"));
const ExamResultPage = lazy(() => import("@/pages/student/ExamResultPage"));
const ExamReviewPage = lazy(() => import("@/pages/student/ExamReviewPage"));
const ExamSubmitPage = lazy(() => import("@/pages/student/ExamSubmitPage"));
const ExamStatsPage = lazy(() => import("@/pages/student/ExamStatsPage"));
const ExamLeaderboardPage = lazy(() => import("@/pages/student/ExamLeaderboardPage"));
const ExamsHomePage = lazy(() => import("@/pages/teacher/exams/ExamsHomePage"));
const CreateMethodPage = lazy(() => import("@/pages/teacher/exams/CreateMethodPage"));
const AiAssistantPage = lazy(() => import("@/pages/teacher/exams/AiAssistantPage"));
const ManualBuilderPage = lazy(() => import("@/pages/teacher/exams/ManualBuilderPage"));
const ReviewQuestionsPage = lazy(() => import("@/pages/teacher/exams/ReviewQuestionsPage"));
const ExamSettingsPage = lazy(() => import("@/pages/teacher/exams/ExamSettingsPage"));
const PreviewPublishPage = lazy(() => import("@/pages/teacher/exams/PreviewPublishPage"));
const TeacherExamAttemptsPage = lazy(() => import("@/pages/teacher/TeacherExamAttemptsPage"));
const TeacherAttemptDetailPage = lazy(() => import("@/pages/teacher/TeacherAttemptDetailPage"));
const TeacherExamAnalyticsPage = lazy(() => import("@/pages/teacher/TeacherExamAnalyticsPage"));
const About = lazy(() => import("@/pages/About"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const DeleteAccount = lazy(() => import("@/pages/DeleteAccount"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const AboutPage = lazy(() => import("@/pages/student/AboutPage"));
const EducationTypeSelection = lazy(() => import("@/pages/EducationTypeSelection"));
const SupportPage = lazy(() => import("@/pages/student/SupportPage"));
const SupportAssistantPage = lazy(() => import("@/pages/student/SupportAssistantPage"));
const WalletPage = lazy(() => import("@/pages/student/WalletPage"));
const DepositPage = lazy(() => import("@/pages/student/DepositPage"));
const StudentSubjectView = lazy(() => import("@/pages/student/StudentSubjectView"));
const StudentNotificationsPage = lazy(() => import("@/pages/student/NotificationsPage"));
const StudentProfilePage = lazy(() => import("@/pages/student/StudentProfilePage"));
const StudentProgressPage = lazy(() => import("@/pages/student/StudentProgressPage"));
const MyCoursesPage = lazy(() => import("@/pages/student/MyCoursesPage"));
const MyLibraryPage = lazy(() => import("@/pages/student/MyLibraryPage"));
const LibraryBookStudio = lazy(() => import("@/pages/student/LibraryBookStudio"));
const CategorySubjectsPage = lazy(() => import("@/pages/student/CategorySubjectsPage"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
const SubscriptionsPage = lazy(() => import("@/pages/admin/SubscriptionsPage"));
const AdminUploadSubjectContent = lazy(() => import("@/pages/admin/AdminUploadSubjectContent"));
const AdminUploadBrowser = lazy(() => import("@/pages/admin/AdminUploadBrowser"));
const AdminCategorySubjectsPage = lazy(() => import("@/pages/admin/AdminCategorySubjectsPage"));
const AdminTeacherPickerPage = lazy(() => import("@/pages/admin/AdminTeacherPickerPage"));
const AdminSubjectsList = lazy(() => import("@/pages/admin/AdminSubjectsList"));
const AdminSubjectContent = lazy(() => import("@/pages/admin/AdminSubjectContent"));
const ContentPage = lazy(() => import("@/pages/admin/ContentPage"));
const NotificationsPage = lazy(() => import("@/pages/admin/NotificationsPage"));
const NotificationDetailPage = lazy(() => import("@/pages/admin/NotificationDetailPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const StudentsPage = lazy(() => import("@/pages/admin/StudentsPage"));
const SubjectsPage = lazy(() => import("@/pages/admin/SubjectsPage"));
const TeachersPage = lazy(() => import("@/pages/admin/TeachersPage"));
const AdminTeacherDetailPage = lazy(() => import("@/pages/admin/AdminTeacherDetailPage"));
const AdminSupportPage = lazy(() => import("@/pages/admin/SupportPage"));
const DeveloperSmartReportsPage = lazy(() => import("@/pages/admin/DeveloperSmartReportsPage"));
const DeveloperTeacherDetailPage = lazy(() => import("@/pages/admin/DeveloperTeacherDetailPage"));
const DeveloperTeacherStudentsPage = lazy(() => import("@/pages/admin/DeveloperTeacherStudentsPage"));
const DeveloperTestStudentsPage = lazy(() => import("@/pages/admin/DeveloperTestStudentsPage"));
const DemoAccountsPage = lazy(() => import("@/pages/admin/DemoAccountsPage"));

const TeacherHomePage = lazy(() => import("@/pages/teacher/TeacherHomePage"));
const TeacherAssistantPage = lazy(() => import("@/pages/teacher/TeacherAssistantPage"));
const TeacherGradeDashboard = lazy(() => import("@/pages/teacher/TeacherGradeDashboard"));
const TeacherAssignmentsDiagnosticsPage = lazy(() => import("@/pages/teacher/TeacherAssignmentsDiagnosticsPage"));
const TeacherSubjectsPage = lazy(() => import("@/pages/teacher/TeacherSubjectsPage"));
const TeacherStudentsPage = lazy(() => import("@/pages/teacher/TeacherStudentsPage"));
const TeacherMessagesPage = lazy(() => import("@/pages/teacher/TeacherMessagesPage"));
const TeacherWalletPage = lazy(() => import("@/pages/teacher/TeacherWalletPage"));
const TeacherProfilePage = lazy(() => import("@/pages/teacher/TeacherProfilePage"));
const TeacherSettingsPage = lazy(() => import("@/pages/teacher/TeacherSettingsPage"));
const TeacherNotificationsPage = lazy(() => import("@/pages/teacher/TeacherNotificationsPage"));
const TeacherStudentManagement = lazy(() => import("@/pages/teacher/TeacherStudentManagement"));
const TeacherEditProfilePage = lazy(() => import("@/pages/teacher/TeacherEditProfilePage"));
const TeacherAccountInfoPage = lazy(() => import("@/pages/teacher/TeacherAccountInfoPage"));
const TeacherSecurityPage = lazy(() => import("@/pages/teacher/TeacherSecurityPage"));
const TeacherSupportSettingsPage = lazy(() => import("@/pages/teacher/TeacherSupportSettingsPage"));
const StudentSecurityPage = lazy(() => import("@/pages/student/StudentSecurityPage"));
const BundlesPage = lazy(() => import("@/pages/student/BundlesPage"));
const BundleCheckoutPage = lazy(() => import("@/pages/student/BundleCheckoutPage"));
const BundledPackagesIndex = lazy(() => import("@/pages/admin/BundledPackages/Index"));
const BundledPackagesGradesPage = lazy(() => import("@/pages/admin/BundledPackages/GradesPage"));
const BundledPackagesSectionSubjectsPage = lazy(() => import("@/pages/admin/BundledPackages/SectionAndSubjectsPage"));
const PackageEditor = lazy(() => import("@/pages/admin/BundledPackages/PackageEditor"));
const PackagesList = lazy(() => import("@/pages/admin/BundledPackages/PackagesList"));
const AdsManagement = lazy(() => import("@/pages/admin/AdsManagement"));
const ModrekLibraryPage = lazy(() => import("@/pages/admin/ModrekLibraryPage"));
const ModrekSourceDetailPage = lazy(() => import("@/pages/admin/ModrekSourceDetailPage"));
const ModrekAnalyticsPage = lazy(() => import("@/pages/admin/ModrekAnalyticsPage"));
const ModrekIndexingDiagnosticsPage = lazy(() => import("@/pages/admin/ModrekIndexingDiagnosticsPage"));
const AdminLibraryPage = lazy(() => import("@/pages/admin/AdminLibraryPage"));
const StudentWalletPage = lazy(() => import("@/pages/admin/StudentWalletPage"));
const StudentDepositDetailPage = lazy(() => import("@/pages/admin/StudentDepositDetailPage"));
const AdDetailPage = lazy(() => import("@/pages/student/AdDetailPage"));
const ModrekAiHome = lazy(() => import("@/pages/student/ModrekAiHome"));
const ModrekAiStudyPage = lazy(() => import("@/pages/student/ModrekAiStudyPage"));
const ModrekAiExamsPage = lazy(() => import("@/pages/student/ModrekAiExamsPage"));
const ModrekAiConversationsPage = lazy(() => import("@/pages/student/ModrekAiConversationsPage"));

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
      // Serve cached data instantly even without network (Stale-While-Revalidate).
      // When connection returns, `refetchOnReconnect: "always"` triggers a
      // background refresh and the UI updates seamlessly.
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "online",
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
      // Cache isolation: one persisted cache per tenant host, so a teacher
      // platform can never rehydrate Modrek Plus rows (or another tenant's).
      key: tenantCacheKey("mp-rq-cache-v3"),
      throttleTime: 1500,
    });
  } catch {
    return null;
  }
})();

const RouteFallback = () => (
  <div dir="rtl" style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",fontFamily:"Cairo,system-ui"}}>
    <div style={{textAlign:"center"}}>
      <div style={{width:36,height:36,border:"3px solid #e2e8f0",borderTopColor:"#2563eb",borderRadius:"50%",animation:"mp-spin 0.8s linear infinite",margin:"0 auto 12px"}} />
      <style>{`@keyframes mp-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{fontSize:14}}>جاري التحميل...</div>
    </div>
  </div>
);

const PlatformLanding = lazy(() => import("./pages/platform/PlatformLanding"));
const AdminPlatformsPage = lazy(() => import("./pages/admin/AdminPlatformsPage"));

/**
 * Root route: on a teacher-platform subdomain (ahmed.modrekplus.com) the home
 * page is the tenant landing page, never the official Modrek Plus marketing
 * page. On the official domain it stays the normal landing page.
 */
function TenantHome() {
  const slug = platformSlugFromHostname(
    typeof window === "undefined" ? "" : window.location.hostname,
  );
  return slug ? <PlatformLanding /> : <Index />;
}

function AnimatedRoutes() {
  return (
    <PageTransition>
      <LazyRouteBoundary>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
              {/* Public */}
              <Route path="/" element={<TenantHome />} />
              <Route path="/p/:slug" element={<PlatformLanding />} />

              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/oauth/native-callback" element={<AuthCallback />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/complete-profile" element={<Navigate to="/select-education-type" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
              <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
              <Route path="/delete-account" element={<DeleteAccount />} />
              <Route path="/account/delete" element={<Navigate to="/delete-account" replace />} />

              {/* Public SEO / discovery pages */}
              {seoPages.map((page) => (
                <Route key={page.slug} path={page.slug} element={<SeoLandingPage page={page} />} />
              ))}
              <Route path="/education/azhari" element={<Navigate to="/education/secondary-azhari" replace />} />
              <Route path="/education/general" element={<Navigate to="/education/secondary-general" replace />} />

              <Route path="/teacher-register" element={<TeacherRegister />} />
              <Route path="/teacher/register" element={<TeacherRegister />} />
              <Route path="/teacher/terms" element={<TeacherTerms />} />
              <Route path="/teacher-terms" element={<Navigate to="/teacher/terms" replace />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/select-education-type" element={<ProtectedRoute allowedRoles={["student"]}><EducationTypeSelection /></ProtectedRoute>} />

              {/* Student */}
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["student"]}><Dashboard /></ProtectedRoute>} />
              <Route path="/subjects" element={<ProtectedRoute allowedRoles={["student"]}><Subjects /></ProtectedRoute>} />
              <Route path="/subject/:subjectId" element={<ProtectedRoute allowedRoles={["student"]}><SubjectPage /></ProtectedRoute>} />
              <Route path="/teacher-selection" element={<ProtectedRoute allowedRoles={["student"]}><TeacherSelection /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
              <Route path="/ai-chat" element={<ProtectedRoute><AiChat /></ProtectedRoute>} />
              <Route path="/subject-ai-chat" element={<Navigate to="/ai" replace />} />
              {/* Modrek AI - unified assistant hub */}
              <Route path="/ai" element={<ProtectedRoute allowedRoles={["student"]}><ModrekAiHome /></ProtectedRoute>} />
              <Route path="/ai/study" element={<ProtectedRoute allowedRoles={["student"]}><ModrekAiStudyPage /></ProtectedRoute>} />
              <Route path="/ai/exams" element={<ProtectedRoute allowedRoles={["student"]}><ModrekAiExamsPage /></ProtectedRoute>} />
              <Route path="/ai/conversations" element={<ProtectedRoute allowedRoles={["student"]}><ModrekAiConversationsPage /></ProtectedRoute>} />
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
              <Route path="/teacher/exams/:examId/attempts/:attemptId" element={<TeacherProtectedRoute><TeacherAttemptDetailPage /></TeacherProtectedRoute>} />
              <Route path="/teacher/exams/:examId/analytics" element={<TeacherProtectedRoute><TeacherExamAnalyticsPage /></TeacherProtectedRoute>} />
              <Route path="/student-exam" element={<Navigate to="/student/exams" replace />} />

              <Route path="/about-platform" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
              <Route path="/support/assistant" element={<ProtectedRoute><SupportAssistantPage /></ProtectedRoute>} />
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
              <Route path="/admin/upload" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUploadBrowser /></ProtectedRoute>} />
              <Route path="/admin/upload/teachers" element={<ProtectedRoute allowedRoles={["admin"]}><AdminTeacherPickerPage /></ProtectedRoute>} />
              {/* Legacy admin upload routes kept temporarily for rollback safety; new flow uses teacher impersonation. */}
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
              <Route path="/admin/demo-accounts" element={<ProtectedRoute allowedRoles={["admin"]}><div dir="rtl" className="p-4 lg:p-8 max-w-6xl mx-auto"><DemoAccountsPage /></div></ProtectedRoute>} />

              <Route path="/admin/students" element={<ProtectedRoute allowedRoles={["admin"]}><StudentsPage /></ProtectedRoute>} />
              <Route path="/admin/subjects-page" element={<ProtectedRoute allowedRoles={["admin"]}><SubjectsPage /></ProtectedRoute>} />
              <Route path="/admin/teachers" element={<ProtectedRoute allowedRoles={["admin"]}><TeachersPage /></ProtectedRoute>} />
              <Route path="/admin/teacher/:teacherId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminTeacherDetailPage /></ProtectedRoute>} />
              <Route path="/admin/support" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSupportPage /></ProtectedRoute>} />
              <Route path="/admin/smart-reports" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperSmartReportsPage /></ProtectedRoute>} />
              <Route path="/admin/developer/teacher/:teacherId" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperTeacherDetailPage /></ProtectedRoute>} />
              <Route path="/admin/developer/teacher/:teacherId/students" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperTeacherStudentsPage /></ProtectedRoute>} />
              <Route path="/admin/library" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLibraryPage /></ProtectedRoute>} />

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
              <Route path="/admin/test-students" element={<ProtectedRoute allowedRoles={["admin"]}><DeveloperTestStudentsPage /></ProtectedRoute>} />
              <Route path="/admin/modrek-analytics" element={<ProtectedRoute allowedRoles={["admin"]}><ModrekAnalyticsPage /></ProtectedRoute>} />
              <Route path="/admin/modrek-indexing" element={<ProtectedRoute allowedRoles={["admin"]}><ModrekIndexingDiagnosticsPage /></ProtectedRoute>} />

              <Route path="/admin/platforms" element={<ProtectedRoute allowedRoles={["admin"]}><AdminPlatformsPage /></ProtectedRoute>} />
              <Route path="/admin/student-wallets" element={<ProtectedRoute allowedRoles={["admin"]}><StudentWalletPage /></ProtectedRoute>} />
              <Route path="/admin/student-wallets/:id" element={<ProtectedRoute allowedRoles={["admin"]}><StudentDepositDetailPage /></ProtectedRoute>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
      </Suspense>
      </LazyRouteBoundary>
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
  "/delete-account",
  "/account/delete",
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

function IntegrityGuardMount() {
  const { user } = useAuth();
  useIntegrityGuard(user?.id);
  useEffect(() => {
    if (!user?.id) return;
    // Warm the offline cache once the user is authenticated
    import("@/lib/offlinePrefetch").then((m) => m.warmOfflineCache()).catch(() => undefined);
  }, [user?.id]);
  return null;
}

function App() {
  const tree = (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <BrowserRouter>
          <PlatformProvider>
          <StartupRedirectHandler />
          <ScrollToTop />
          <RouteActivityTracker />
          <MetaPixelTracker />
          <TikTokPixelTracker />

          <IntegrityGuardMount />
          <AdminDsScope />
          <TeacherDsScope />
          <StudentDsScope />
          <AppSplash />
          <AppUpdateDialog />
          <PlatformBrandBar />
          <AnimatedRoutes />
          </PlatformProvider>
        </BrowserRouter>

        <Toaster />
        <ShadcnToaster />
      </AuthProvider>
    </ThemeProvider>
  );

  const body = queryPersister ? (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60_000,
        buster: (import.meta as any).env?.VITE_APP_VERSION || DATA_SCHEMA_VERSION,
        dehydrateOptions: {
          // Wave-4 guard: never persist auth-sensitive keys, never persist
          // live-critical keys (wallet/subs/notifications), and never persist
          // any query whose data contains Map/Set/Date/File/class instances
          // because localStorage JSON round-trip silently strips their methods
          // and causes ".get is not a function" style crashes in production.
          shouldDehydrateQuery: (q) => {
            if (q.state.status !== "success") return false;
            if (!shouldPersistQueryKey(q.queryKey)) return false;
            if (!isJsonSafe(q.state.data)) return false;
            return true;
          },
        },
      }}
    >
      {tree}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
  );

  return <ErrorBoundary>{body}</ErrorBoundary>;
}

export default App;
