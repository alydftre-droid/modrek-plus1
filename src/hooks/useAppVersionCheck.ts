import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

export type AppVersionInfo = {
  platform: "android" | "ios";
  latest_version: string;
  latest_build_number: number;
  min_supported_version: string | null;
  store_url: string;
  release_notes: string | null;
  force_update: boolean;
  current_version: string;
  current_build: number;
  needs_update: boolean;
  is_force: boolean;
};

// Compare semver-ish strings like 1.2.3
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

const DISMISS_KEY = "app-update-dismissed-version";

export function useAppVersionCheck() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only run on native mobile
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform() as "android" | "ios";
    if (platform !== "android" && platform !== "ios") return;

    let cancelled = false;

    (async () => {
      try {
        const appInfo = await CapApp.getInfo();
        const currentVersion = appInfo.version || "0.0.0";
        const currentBuild = parseInt(String(appInfo.build || "1"), 10) || 1;

        const { data, error } = await supabase
          .from("app_versions")
          .select("*")
          .eq("platform", platform)
          .eq("is_active", true)
          .maybeSingle();

        if (error || !data || cancelled) return;

        const cmp = compareVersions(data.latest_version, currentVersion);
        const needsUpdate =
          cmp > 0 || (cmp === 0 && (data.latest_build_number || 0) > currentBuild);

        const isForce =
          data.force_update ||
          (data.min_supported_version
            ? compareVersions(currentVersion, data.min_supported_version) < 0
            : false);

        const result: AppVersionInfo = {
          platform: data.platform as "android" | "ios",
          latest_version: data.latest_version,
          latest_build_number: data.latest_build_number,
          min_supported_version: data.min_supported_version,
          store_url: data.store_url,
          release_notes: data.release_notes,
          force_update: data.force_update,
          current_version: currentVersion,
          current_build: currentBuild,
          needs_update: needsUpdate,
          is_force: isForce && needsUpdate,
        };

        setInfo(result);

        if (needsUpdate) {
          const dismissed = localStorage.getItem(DISMISS_KEY);
          // Always show if force; otherwise only show if user hasn't dismissed this exact version
          if (result.is_force || dismissed !== data.latest_version) {
            setOpen(true);
          }
        }
      } catch (e) {
        console.warn("[version-check] failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (info && !info.is_force) {
      localStorage.setItem(DISMISS_KEY, info.latest_version);
    }
    setOpen(false);
  };

  return { info, open, dismiss };
}
