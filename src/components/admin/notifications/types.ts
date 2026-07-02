export type AudienceType = "students" | "teachers" | "parents" | "all";

export type SelectionMethod =
  | "all"
  | "manual"
  | "by_stage"
  | "by_grade"
  | "by_subject"
  | "by_group"
  | "by_teacher"
  | "new_users"
  | "inactive"
  | "expired_subscription"
  | "expiring_soon"
  | "top_teachers"
  | "pending_withdrawal";

export type TargetConfig = {
  audience: AudienceType;
  method: SelectionMethod;
  // parameters
  stage?: string;
  grade?: string;
  subjectId?: string;
  groupId?: string;
  teacherId?: string;
  windowDays?: number; // for new/inactive/expiring
  manualIds?: string[];
};

export type ResolvedUser = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  student_code: string | null;
  teacher_code: string | null;
};

export type NotifKind = "normal" | "important" | "urgent" | "warning" | "announcement" | "update";

export type NotifRecord = {
  id: string;
  title: string;
  message: string;
  user_id: string | null;
  created_at: string;
  is_sent: boolean;
  scheduled_at: string | null;
  notification_type: string | null;
  link: string | null;
  is_read: boolean | null;
};
