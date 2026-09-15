import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TeacherProfileCache = {
  full_name?: string | null;
  avatar_url?: string | null;
  teacher_code?: string | null;
  profile_updated_at?: string | null;
  teacher_photo_url?: string | null;
  teacher_profile_updated_at?: string | null;
};

const toTime = (value?: string | null) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

/**
 * Adds a cache-busting query only to real web URLs. A Bunny reference
 * (`bstorage://…`) is a storage KEY, not a URL: appending `?v=` to it produces a
 * path that does not exist, which is what made freshly uploaded photos render
 * as broken images everywhere.
 */
export const appendImageCacheBuster = (url: string) => {
  if (!url || url.startsWith("bstorage://") || url.startsWith("bunny://") || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
};

export function selectTeacherAvatarUrl(
  profileAvatarUrl?: string | null,
  profileUpdatedAt?: string | null,
  teacherPhotoUrl?: string | null,
  teacherProfileUpdatedAt?: string | null,
) {
  if (profileAvatarUrl && teacherPhotoUrl) {
    return toTime(profileUpdatedAt) >= toTime(teacherProfileUpdatedAt) ? profileAvatarUrl : teacherPhotoUrl;
  }

  return profileAvatarUrl || teacherPhotoUrl || null;
}

export async function saveTeacherAccountAvatar(userId: string, avatarUrl: string) {
  const updatedAt = new Date().toISOString();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: updatedAt })
    .eq("id", userId);

  if (profileError) throw profileError;

  const { data: teacherProfile } = await supabase
    .from("teacher_profiles")
    .select("teacher_id")
    .eq("teacher_id", userId)
    .maybeSingle();

  if (teacherProfile) {
    const { error: teacherProfileError } = await supabase
      .from("teacher_profiles")
      .update({ photo_url: avatarUrl, updated_at: updatedAt })
      .eq("teacher_id", userId);

    if (teacherProfileError) throw teacherProfileError;
  }

  return updatedAt;
}

export function setTeacherProfileAvatarCache(
  queryClient: QueryClient,
  userId: string,
  avatarUrl: string,
  updatedAt = new Date().toISOString(),
) {
  queryClient.setQueryData<TeacherProfileCache | null>(["teacher-profile", userId], (old) => {
    if (!old) return old;
    return {
      ...old,
      avatar_url: avatarUrl,
      teacher_photo_url: avatarUrl,
      profile_updated_at: updatedAt,
      teacher_profile_updated_at: updatedAt,
    };
  });
}
