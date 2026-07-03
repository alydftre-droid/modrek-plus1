import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight } from "lucide-react";
import StudentAccountSheet from "./StudentAccountSheet";
import { getPostSignOutPath, isImpersonating } from "@/lib/devImpersonation";

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function StudentSidebarLayout({ children, title }: Props) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null; student_code: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url, student_code")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const handleSignOut = async () => {
    const nextPath = getPostSignOutPath("/auth");
    await signOut();
    navigate(nextPath, { replace: true });
  };

  const initials = profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";

  return (
    <div className="safe-area-x min-h-screen bg-background flex overflow-x-hidden" dir="rtl">
      <StudentAccountSheet
        open={accountSheetOpen}
        onOpenChange={setAccountSheetOpen}
        profile={profile}
        onSignOut={handleSignOut}
        isDeveloperImpersonation={isImpersonating()}
      />

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="mobile-app-header-inner flex items-center justify-between px-4">
            <button
              onClick={() => setAccountSheetOpen(true)}
              className="flex items-center"
            >
              <Avatar className="h-9 w-9 border-2 border-primary/20">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            {title && <h1 className="text-lg font-bold truncate px-2">{title}</h1>}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              <ArrowRight className="h-4 w-4" />
              رجوع
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-y-auto touch-pan-y [-webkit-overflow-scrolling:touch]">
          {children}
        </main>
      </div>
    </div>
  );
}
