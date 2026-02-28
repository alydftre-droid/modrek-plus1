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

export const useSubscription = (subjectId?: string) => {
  const { user, role } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
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

      // Filter out expired subscriptions
      const now = new Date();
      const activeSubscriptions = (data || []).filter(
        (sub) => new Date(sub.end_date) > now
      );

      setSubscriptions(activeSubscriptions);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, subjectId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const hasActiveSubscription = useCallback(
    (targetSubjectId?: string) => {
      // Admin always has access
      if (role === "admin") return true;

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
    isLoading,
    hasActiveSubscription,
    getSubscription,
    refetch: fetchSubscriptions,
  };
};
