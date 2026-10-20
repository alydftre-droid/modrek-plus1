/**
 * Decides whether a "failed to load code" error may trigger the automatic
 * one-time page reload used to recover from a stale deploy.
 *
 * Third-party libraries (notably the Zoom Meeting SDK) load their own webpack
 * chunks and raise "Loading chunk N failed" errors on flaky networks. Reloading
 * the app for those errors kicked the teacher out of the live class, which
 * ended Zoom's meeting for every student. Only our own app files may trigger
 * the reload, and never while a live class is on screen.
 */
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /error loading dynamically imported module/i,
];

export function isChunkLoadMessage(message: string, errorName = ""): boolean {
  return /ChunkLoadError/i.test(errorName) || CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

export function shouldAutoReloadForChunkError(input: {
  message: string;
  errorName?: string;
  liveClassOpen: boolean;
  appOrigin: string;
}): boolean {
  if (input.liveClassOpen) return false;
  if (!isChunkLoadMessage(input.message, input.errorName)) return false;
  // A failing URL from another host (Zoom, CDNs) is never fixed by reloading us.
  const urls = input.message.match(/https?:\/\/[^\s)"']+/g) || [];
  if (urls.some((url) => !url.startsWith(input.appOrigin))) return false;
  return true;
}

export function isLiveClassOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("modrek-live-open");
}
