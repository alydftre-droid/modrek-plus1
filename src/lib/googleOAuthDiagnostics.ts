type GoogleOAuthAttemptStatus = "pending" | "redirecting" | "callback" | "success" | "failed" | "cancelled";

export type GoogleOAuthAttempt = {
  attemptId: string;
  correlationId: string;
  startedAt: string;
  finishedAt?: string;
  status: GoogleOAuthAttemptStatus;
  environment: string;
  source: string;
  redirectUri?: string;
  finalPath?: string;
  finalUrl?: string;
  error?: string;
  events: GoogleOAuthAttemptEvent[];
};

export type GoogleOAuthAttemptEvent = {
  id: string;
  timestamp: string;
  type: string;
  status: GoogleOAuthAttemptStatus;
  pageUrl?: string;
  path?: string;
  redirectUri?: string;
  referrer?: string;
  error?: string;
  details?: Record<string, string>;
};

type StartAttemptOptions = {
  correlationId?: string;
  source: string;
  redirectUri?: string;
};

type EventOptions = {
  correlationId?: string;
  type: string;
  status: GoogleOAuthAttemptStatus;
  redirectUri?: string;
  error?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
  source?: string;
};

const STORAGE_KEY = "google_oauth_debug_attempts_v1";
const PENDING_KEY = "google_oauth_debug_pending_v1";
const MAX_ATTEMPTS = 60;

const isBrowser = typeof window !== "undefined";

function toRecord(details?: Record<string, string | number | boolean | null | undefined>) {
  if (!details) return undefined;

  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value == null ? "" : String(value)]),
  );
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getEnvironment() {
  if (!isBrowser) return "server";

  const ua = navigator.userAgent || "";
  const hostname = window.location.hostname;
  if (/Android|iPhone|iPad|Capacitor/i.test(ua) && hostname === "localhost") return "native-app";
  if (hostname.startsWith("id-preview--") || document.referrer.includes("lovable.dev/projects")) return "preview-web";
  return "web";
}

function readAttempts(): GoogleOAuthAttempt[] {
  if (!isBrowser) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAttempts(attempts: GoogleOAuthAttempt[]) {
  if (!isBrowser) return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts.slice(0, MAX_ATTEMPTS)));
}

function readPendingAttempt(): GoogleOAuthAttempt | null {
  if (!isBrowser) return null;

  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePendingAttempt(attempt: GoogleOAuthAttempt | null) {
  if (!isBrowser) return;

  if (!attempt) {
    window.localStorage.removeItem(PENDING_KEY);
    return;
  }

  window.localStorage.setItem(PENDING_KEY, JSON.stringify(attempt));
}

function persistAttempt(attempt: GoogleOAuthAttempt) {
  const attempts = readAttempts();
  const index = attempts.findIndex((entry) => entry.attemptId === attempt.attemptId);

  if (index >= 0) {
    attempts[index] = attempt;
  } else {
    attempts.unshift(attempt);
  }

  writeAttempts(attempts);
}

function currentPageUrl() {
  return isBrowser ? window.location.href : undefined;
}

function currentPath() {
  return isBrowser ? `${window.location.pathname}${window.location.search}${window.location.hash}` : undefined;
}

function eventFromOptions(options: EventOptions): GoogleOAuthAttemptEvent {
  return {
    id: createId("evt"),
    timestamp: new Date().toISOString(),
    type: options.type,
    status: options.status,
    pageUrl: currentPageUrl(),
    path: currentPath(),
    redirectUri: options.redirectUri,
    referrer: isBrowser ? document.referrer || undefined : undefined,
    error: options.error,
    details: toRecord(options.details),
  };
}

const CANONICAL_PUBLISHED_ORIGIN = "https://modrek-plus.lovable.app";

export function buildGoogleOAuthWebRedirectUri(correlationId?: string) {
  if (!isBrowser) return "/auth";

  // Always normalize to the canonical published domain so the redirect_uri
  // matches the configured OAuth callback domain.
  let origin = window.location.origin;
  try {
    const current = new URL(origin);
    if (
      current.hostname === "www.modrekplus.com" ||
      current.hostname === "modrekplus.com" ||
      current.hostname === "www.modrek-plus.lovable.app"
    ) {
      origin = CANONICAL_PUBLISHED_ORIGIN;
    }
  } catch {
    // ignore — fall back to window.location.origin
  }

  const url = new URL("/auth/callback", origin);
  if (correlationId) url.searchParams.set("cid", correlationId);
  return url.toString();
}

export function startGoogleOAuthAttempt(options: StartAttemptOptions) {
  const correlationId = options.correlationId || createId("gcid");
  const startedAt = new Date().toISOString();
  const attempt: GoogleOAuthAttempt = {
    attemptId: createId("attempt"),
    correlationId,
    startedAt,
    status: "pending",
    environment: getEnvironment(),
    source: options.source,
    redirectUri: options.redirectUri,
    events: [
      eventFromOptions({
        type: "attempt_started",
        status: "pending",
        redirectUri: options.redirectUri,
        details: {
          environment: getEnvironment(),
          source: options.source,
        },
      }),
    ],
  };

  persistAttempt(attempt);
  writePendingAttempt(attempt);
  return attempt;
}

export function ensureGoogleOAuthAttempt(options: StartAttemptOptions) {
  const pending = readPendingAttempt();
  if (pending && (!options.correlationId || pending.correlationId === options.correlationId)) {
    return pending;
  }

  return startGoogleOAuthAttempt(options);
}

export function getPendingGoogleOAuthAttempt() {
  return readPendingAttempt();
}

export function recordGoogleOAuthEvent(options: EventOptions) {
  const attempt = ensureGoogleOAuthAttempt({
    correlationId: options.correlationId,
    source: options.source || "implicit",
    redirectUri: options.redirectUri,
  });

  const nextAttempt: GoogleOAuthAttempt = {
    ...attempt,
    status: options.status,
    redirectUri: options.redirectUri || attempt.redirectUri,
    events: [...attempt.events, eventFromOptions(options)],
  };

  if (options.status === "success" || options.status === "failed" || options.status === "cancelled") {
    nextAttempt.finishedAt = new Date().toISOString();
    nextAttempt.finalPath = currentPath();
    nextAttempt.finalUrl = currentPageUrl();
    nextAttempt.error = options.error || nextAttempt.error;
    persistAttempt(nextAttempt);
    writePendingAttempt(null);
    return nextAttempt;
  }

  persistAttempt(nextAttempt);
  writePendingAttempt(nextAttempt);
  return nextAttempt;
}

export function finalizeGoogleOAuthAttempt(options: EventOptions) {
  return recordGoogleOAuthEvent(options);
}

export function clearGoogleOAuthAttempts() {
  if (!isBrowser) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(PENDING_KEY);
}

export function getGoogleOAuthAttempts() {
  return readAttempts();
}

export function parseGoogleOAuthCallbackUrl(url = isBrowser ? window.location.href : "") {
  try {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const get = (key: string) => parsed.searchParams.get(key) || hashParams.get(key) || "";
    const cid = parsed.searchParams.get("cid") || hashParams.get("cid") || undefined;
    const error = get("error") || undefined;
    const errorDescription = get("error_description") || undefined;
    const state = get("state") || undefined;
    const code = get("code") || undefined;
    const accessToken = get("access_token") || undefined;
    const refreshToken = get("refresh_token") || undefined;
    const isGoogleReturn = parsed.pathname.includes("/auth/callback")
      || parsed.pathname.includes("oauth/native-callback")
      || Boolean(error || errorDescription || code || accessToken || refreshToken);

    return {
      isGoogleReturn,
      correlationId: cid,
      error,
      errorDescription,
      state,
      code,
      accessToken,
      refreshToken,
      pathname: parsed.pathname,
      fullUrl: parsed.toString(),
    };
  } catch {
    return {
      isGoogleReturn: false,
    };
  }
}

export function recordGoogleOAuthCallbackSnapshot(source = "callback") {
  const snapshot = parseGoogleOAuthCallbackUrl();
  if (!snapshot.isGoogleReturn) return snapshot;

  recordGoogleOAuthEvent({
    correlationId: snapshot.correlationId,
    source,
    type: "callback_received",
    status: snapshot.error || snapshot.errorDescription ? "failed" : "callback",
    error: snapshot.errorDescription || snapshot.error,
    details: {
      pathname: snapshot.pathname,
      has_code: Boolean(snapshot.code),
      has_access_token: Boolean(snapshot.accessToken),
      has_refresh_token: Boolean(snapshot.refreshToken),
      has_state: Boolean(snapshot.state),
    },
  });

  return snapshot;
}

function buildCsv(attempts: GoogleOAuthAttempt[]) {
  const rows = [
    [
      "attempt_id",
      "correlation_id",
      "status",
      "environment",
      "source",
      "started_at",
      "finished_at",
      "redirect_uri",
      "final_path",
      "error",
      "events_count",
    ],
    ...attempts.map((attempt) => [
      attempt.attemptId,
      attempt.correlationId,
      attempt.status,
      attempt.environment,
      attempt.source,
      attempt.startedAt,
      attempt.finishedAt || "",
      attempt.redirectUri || "",
      attempt.finalPath || "",
      attempt.error || "",
      String(attempt.events.length),
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadText(filename: string, content: string, mimeType: string) {
  if (!isBrowser) return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadGoogleOAuthSummary(format: "json" | "csv") {
  const attempts = getGoogleOAuthAttempts();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "csv") {
    downloadText(`google-oauth-summary-${stamp}.csv`, buildCsv(attempts), "text/csv;charset=utf-8");
    return;
  }

  downloadText(`google-oauth-summary-${stamp}.json`, JSON.stringify(attempts, null, 2), "application/json;charset=utf-8");
}