import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { selectTeacherAvatarUrl } from "@/lib/teacherAvatar";

export function useTeacherProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const [{ data: profile }, { data: teacherProfile }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, avatar_url, teacher_code, updated_at")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("teacher_profiles")
          .select("photo_url, updated_at")
          .eq("teacher_id", user.id)
          .maybeSingle(),
      ]);

      if (!profile) return null;

      return {
        full_name: profile.full_name,
        teacher_code: profile.teacher_code,
        avatar_url: selectTeacherAvatarUrl(
          profile.avatar_url,
          profile.updated_at,
          teacherProfile?.photo_url,
          teacherProfile?.updated_at,
        ),
        profile_updated_at: profile.updated_at,
        teacher_photo_url: teacherProfile?.photo_url ?? null,
        teacher_profile_updated_at: teacherProfile?.updated_at ?? null,
      };
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useTeacherAssignments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-assignments", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("teacher_assignments")
        .select("id, stage, grade, section, category, education_type, created_at")
        .eq("teacher_id", user.id);
      return data || [];
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useTeacherWallet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-wallet", user?.id],
    queryFn: async () => {
      if (!user) return { balance: 0, total_earned: 0 };
      const { data } = await supabase.from("teacher_wallets").select("*").eq("teacher_id", user.id).maybeSingle();
      if (!data) {
        await supabase.from("teacher_wallets").insert({ teacher_id: user.id, balance: 0, total_earned: 0 });
        return { balance: 0, total_earned: 0 };
      }
      return data;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export function useTeacherPaymentMethods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-payment-methods", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("teacher_payment_methods").select("*").eq("teacher_id", user.id).order("created_at");
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeacherWithdrawals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-withdrawals", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("teacher_withdrawal_requests").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export function useUnreadNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-unread-notifs", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);
      return count || 0;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 120 * 1000,
  });
}
