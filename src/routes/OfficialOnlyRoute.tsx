/**
 * Routing isolation: routes that belong to the official Modrek Plus platform
 * only (teacher marketplace/discovery, public teacher registration, SEO landing
 * pages). On a teacher-platform host they do not exist.
 */
import { Navigate } from "react-router-dom";
import { isOfficialTenantHost } from "@/lib/tenant";

export default function OfficialOnlyRoute({ children }: { children: React.ReactNode }) {
  if (!isOfficialTenantHost()) return <Navigate to="/" replace />;
  return <>{children}</>;
}
