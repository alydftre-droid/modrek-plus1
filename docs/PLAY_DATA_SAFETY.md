# Google Play Data Safety — Full Audit & Exact Declaration (مدرك Plus / com.modrek.plus)

Audit date: 2026-08-01. Source of truth: this repository (Android shell + web bundle + Supabase edge functions).
No feature, auth, or UI code was changed by this audit.

---

## 1. SDKs present in the Android app

| SDK / component | Present | Collects data? | What & why |
|---|---|---|---|
| Supabase Auth + Postgres (`@supabase/supabase-js`) | Yes | **Yes** | Email, name, phone (optional), password (hashed by Auth), IP + user-agent in server logs. Account creation & login. |
| Google Sign-In via Android Credential Manager (native, `ModrekGoogleAuth`) | Yes | **Yes** | Google account **email**, name, profile photo URL, Google account ID (via ID token) → exchanged for a Supabase session. |
| Firebase Cloud Messaging (`firebase-messaging`, BOM 33.5.1) | Yes | **Yes, automatically** | FCM registration token (a device identifier) + basic device/app instance info. Required by FCM to route push notifications; token stored in `device_push_tokens`. **No Firebase Analytics / Crashlytics module is included.** |
| Sentry (`@sentry/react`) | Yes (only active if `VITE_SENTRY_DSN` is set at build time) | **Yes, if enabled** | Crash/error stack traces, app version, URL/route, browser+device metadata, IP (transport-level). Auth headers/tokens are redacted in `beforeSend`; session replay of user input is disabled (`replaysSessionSampleRate: 0`). |
| Bunny.net Stream/Storage (video + files) | Yes | Yes (technical) | IP address & request logs for video/file delivery. |
| Jitsi / LiveKit (live classes) | Yes | Yes, only during a live class | Microphone/camera stream, display name, IP. Not stored by us unless the session is recorded (recordings are private, owner-scoped). |
| AI providers (Lovable AI Gateway / Gemini / OpenRouter) via edge functions | Yes | Yes | The text/questions/attachments the user sends to the AI tutor or exam assistant are transmitted for processing (server-side only; API keys never in the app). |
| Google Analytics / Facebook SDK / AdMob / any ad SDK | **No** | — | Not integrated anywhere (`gtag`, `posthog`, ad SDKs: zero matches). |

Android permissions declared: `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`. No location, contacts, SMS, or advertising-ID permission.

---

## 2. Personal data actually collected

| Data | Collected | Where |
|---|---|---|
| **Email address** | **YES — required** | Sign-up/login form and Google Sign-In; stored in `auth.users` + `public.profiles.email`. |
| Name | YES (required) | `profiles.full_name`; also from Google ID token. |
| Phone number | YES (optional) | `profiles.phone`, `deposit.phone_number` (wallet top-ups). |
| Password | YES | Supabase Auth (hashed, never stored by app code). |
| Photos / files | YES (user-initiated) | Avatar upload, payment receipt (`deposit.receipt_url`), library PDFs, teacher intro video. |
| In-app messages | YES | Teacher↔student chat, support tickets, AI conversations. |
| Device identifiers | YES | FCM registration token (`device_push_tokens.token`). No advertising ID, no IMEI, no MAC. |
| Approximate/precise location | NO | Not requested or collected. |
| Contacts, calendar, SMS, call logs, health, financial account numbers | NO | Not collected. |
| Purchase history | YES (in-app wallet only, no Play Billing) | Wallet transactions, subscriptions. |
| App activity / analytics | YES (first-party only) | `user_activity_logs`: page path, action type, duration, coarse device type/OS/browser derived from user-agent, self-generated session ID. Stored in our own database; no third-party analytics SDK. |
| Crash logs & diagnostics | YES if Sentry DSN is configured | Sentry. |
| IP address | YES (server-side logs) | Supabase / Bunny CDN / Sentry transport. |

Nothing is sold. Data is not shared for advertising. Third parties listed above are **service providers processing on our behalf** (Play treats FCM/Sentry/Bunny/AI processing as "collected", not "shared", because they act as processors under our instructions).

---

## 3. Exact Google Play Data Safety form answers

**Data collection & security section**
- Does your app collect or share any of the required user data types? → **Yes**
- Is all of the user data collected by your app encrypted in transit? → **Yes** (HTTPS/TLS everywhere; `cleartext: false`, `allowMixedContent: false`)
- Do you provide a way for users to request that their data be deleted? → **Yes** — deletion is available in-app/on request (developer account deletion tooling exists) and via `alyedaft@gmail.com`. Provide the privacy policy URL `https://modrekplus.com/privacy-policy`.
- Independent security review → leave **No** unless you have one.

**Data types — select exactly these:**

| Category → Type | Collected | Shared | Processed ephemerally? | Required or optional | Purposes |
|---|---|---|---|---|---|
| Personal info → **Email address** | ✅ Yes | No | No (stored) | **Required** | App functionality; Account management |
| Personal info → **Name** | ✅ Yes | No | No | Required | App functionality; Account management |
| Personal info → **Phone number** | ✅ Yes | No | No | **Optional** | App functionality; Account management; Customer support |
| Personal info → **User IDs** | ✅ Yes | No | No | Required | App functionality; Account management |
| Financial info → **Purchase history** | ✅ Yes | No | No | Optional | App functionality |
| Photos and videos → **Photos** | ✅ Yes | No | No | Optional | App functionality (avatar, payment receipt) |
| Photos and videos → **Videos** | ✅ Yes | No | No | Optional | App functionality (teacher intro video, uploaded lessons) |
| Audio → **Voice or sound recordings** | ✅ Yes (live classes / voice answers only) | No | ✅ **Yes, processed ephemerally** | Optional | App functionality |
| Files and docs → **Files and docs** | ✅ Yes | No | No | Optional | App functionality (library PDFs) |
| Messages → **Other in-app messages** | ✅ Yes | No | No | Optional | App functionality; Customer support |
| App activity → **App interactions** | ✅ Yes | No | No | Required | App functionality; **Analytics** |
| App activity → **Other user-generated content** | ✅ Yes | No | No | Optional | App functionality (exam answers, AI prompts) |
| App info & performance → **Crash logs** | ✅ Yes | No | No | Required | **Crash/diagnostics** |
| App info & performance → **Diagnostics** | ✅ Yes | No | No | Required | Crash/diagnostics; App functionality |
| Device or other IDs → **Device or other IDs** | ✅ Yes | No | No | Required | App functionality (push notifications); Crash/diagnostics |

**Leave unchecked (do NOT declare):** Location (approximate/precise), Race & ethnicity, Political/religious beliefs, Sexual orientation, Address, Health & fitness, Contacts, Calendar, SMS/call logs, Web browsing history, Installed apps, Search history, Advertising ID, Payment info/credit score.

Notes for the form:
- If `VITE_SENTRY_DSN` is **not** set in your release build, you may drop **Crash logs**; keep **Diagnostics** + **Device or other IDs** because FCM always collects a device token. Safest and recommended: declare them as above.
- No "Data shared" rows: answer "No" to sharing for every type. Do not tick any advertising or marketing purpose.

---

## 4. Why the previous declaration was rejected

Google detected the app transmitting the user's **email address** (Supabase Auth sign-up/login and Google Sign-In) while the Data Safety form declared no email collection. Fixing the rejection requires only ticking **Personal info → Email address (Collected, Required, purposes: App functionality + Account management, not shared)** — plus the other rows above so the rest of the declaration also matches reality. The app's privacy policy page already discloses name, email and phone collection, so no code or policy change is needed.

---

## 5. Compliance checklist before resubmitting

1. Update Data Safety form exactly as in section 3, save, and resubmit for review (same `versionCode 31` AAB is fine — no new build needed for a Data Safety fix).
2. Privacy policy URL is reachable and lists email/name/phone/device-token/crash data → `https://modrekplus.com/privacy-policy` (already the case).
3. Keep account-deletion instructions in the Play Console "Data deletion" field pointing at the in-app deletion path and `alyedaft@gmail.com`.
