import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ContentGroup = {
  id: string;
  subject_id: string;
  section_name: string;
  title: string;
  description: string | null;
  price: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

export type GroupPurchase = {
  id: string;
  student_id: string;
  group_id: string;
  purchased_at: string;
  activated_by_admin: boolean;
};

export const useContentGroups = (subjectId?: string) => {
  const { user, role } = useAuth();
  const [groups, setGroups] = useState<ContentGroup[]>([]);
  const [purchases, setPurchases] = useState<GroupPurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!subjectId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("content_groups" as any)
        .select("*")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setGroups((data as any as ContentGroup[]) || []);
    } catch (e) {
      console.error("Error fetching content groups:", e);
    }
  }, [subjectId]);

  const fetchPurchases = useCallback(async () => {
    if (!user || !subjectId) {
      setIsLoading(false);
      return;
    }

    try {
      // Get all group IDs for this subject first
      const { data: groupData } = await supabase
        .from("content_groups" as any)
        .select("id")
        .eq("subject_id", subjectId);

      if (!groupData || groupData.length === 0) {
        setPurchases([]);
        return;
      }

      const groupIds = (groupData as any[]).map((g) => g.id);

      const { data, error } = await supabase
        .from("student_group_purchases" as any)
        .select("*")
        .eq("student_id", user.id)
        .in("group_id", groupIds);

      if (error) throw error;
      setPurchases((data as any as GroupPurchase[]) || []);
    } catch (e) {
      console.error("Error fetching purchases:", e);
    }
  }, [user, subjectId]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchGroups(), fetchPurchases()]);
      setIsLoading(false);
    };
    load();
  }, [fetchGroups, fetchPurchases]);

  const hasGroupAccess = useCallback(
    (groupId: string) => {
      // Admin/teacher always have access
      if (role === "admin" || role === "teacher") return true;
      return purchases.some((p) => p.group_id === groupId);
    },
    [purchases, role]
  );

  const hasAnyPurchaseInSubject = useCallback(() => {
    if (role === "admin" || role === "teacher") return true;
    return purchases.length > 0;
  }, [purchases, role]);

  return {
    groups,
    purchases,
    isLoading,
    hasGroupAccess,
    hasAnyPurchaseInSubject,
    refetch: async () => {
      await Promise.all([fetchGroups(), fetchPurchases()]);
    },
  };
};
