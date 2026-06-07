export function pruneLegacySupabaseAuthStorage() {
  if (typeof window === "undefined") return;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return;

  let currentProjectRef = "";
  try {
    currentProjectRef = new URL(url).hostname.split(".")[0] || "";
  } catch {
    return;
  }

  const prefixes = [`sb-${currentProjectRef}-`, `supabase.auth.token`];
  const keys = Object.keys(window.localStorage);

  keys.forEach((key) => {
    if (!key.startsWith("sb-")) return;
    if (prefixes.some((prefix) => key.startsWith(prefix))) return;
    window.localStorage.removeItem(key);
  });
}