import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Subscription {
  id: string;
  student_id: string;
  subject_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface GroupPurchase {
  id: string;
  student_id: string;
  group_id: string;
  purchased_at: string;
}

export const useSubscription = (subjectId?: string) => {
  const { user, role } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [groupPurchases, setGroupPurchases] = useState<GroupPurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch legacy subject subscriptions
      let query = supabase
        .from("subscriptions")
        .select("*")
        .eq("student_id", user.id)
        .eq("is_active", true);

      if (subjectId) {
        query = query.eq("subject_id", subjectId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = new Date();
      const activeSubscriptions = (data || []).filter(
        (sub) => new Date(sub.end_date) > now
      );
      setSubscriptions(activeSubscriptions);

      // Fetch group purchases for this subject
      if (subjectId) {
        const { data: groupData } = await supabase
          .from("content_groups" as any)
          .select("id")
          .eq("subject_id", subjectId);

        if (groupData && groupData.length > 0) {
          const groupIds = (groupData as any[]).map((g) => g.id);
          const { data: purchaseData } = await supabase
            .from("student_group_purchases" as any)
            .select("*")
            .eq("student_id", user.id)
            .in("group_id", groupIds);

          setGroupPurchases((purchaseData as any as GroupPurchase[]) || []);
        }
      }
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, subjectId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  // Legacy: check subject-level subscription
  const hasActiveSubscription = useCallback(
    (targetSubjectId?: string) => {
      if (role === "admin" || role === "teacher") return true;

      const checkId = targetSubjectId || subjectId;
      if (!checkId) return false;

      const now = new Date();
      return subscriptions.some(
        (sub) =>
          sub.subject_id === checkId &&
          sub.is_active &&
          new Date(sub.end_date) > now
      );
    },
    [subscriptions, subjectId, role]
  );

  // New: check group-level purchase
  const hasGroupAccess = useCallback(
    (groupId: string) => {
      if (role === "admin" || role === "teacher") return true;
      return groupPurchases.some((p) => p.group_id === groupId);
    },
    [groupPurchases, role]
  );

  // Check if student has ANY group purchase in this subject
  const hasAnyGroupPurchase = useCallback(() => {
    if (role === "admin" || role === "teacher") return true;
    return groupPurchases.length > 0;
  }, [groupPurchases, role]);

  // Combined: has access either via legacy subscription OR group purchase
  const isSubscribed = hasActiveSubscription(subjectId) || hasAnyGroupPurchase();

  const getSubscription = useCallback(
    (targetSubjectId?: string) => {
      const checkId = targetSubjectId || subjectId;
      if (!checkId) return null;

      const now = new Date();
      return (
        subscriptions.find(
          (sub) =>
            sub.subject_id === checkId &&
            sub.is_active &&
            new Date(sub.end_date) > now
        ) || null
      );
    },
    [subscriptions, subjectId]
  );

  return {
    subscriptions,
    groupPurchases,
    isLoading,
    isSubscribed,
    hasActiveSubscription,
    hasGroupAccess,
    hasAnyGroupPurchase,
    getSubscription,
    refetch: fetchSubscriptions,
  };
};
