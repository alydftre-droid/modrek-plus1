import fs from "node:fs";

const fail = (message) => {
  console.error(`[google-auth-config] ${message}`);
  process.exitCode = 1;
};

const read = (path) => fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
const mainActivity = read("android/app/src/main/java/com/modrek/plus/MainActivity.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const capacitorConfig = read("capacitor.config.ts");
const authRuntime = read("src/lib/googleAuthRuntime.ts");
const nativeGoogleAuth = read("src/lib/nativeGoogleAuth.ts");
const useAuth = read("src/hooks/useAuth.tsx");
const capacitorInit = read("src/capacitor-init.ts");
const capacitorBuild = read("android/app/capacitor.build.gradle");
const capacitorSettings = read("android/capacitor.settings.gradle");
const packageJson = JSON.parse(read("package.json") || "{}");
const googleServices = JSON.parse(read("android/app/google-services.json") || "{}");

const packageName = googleServices.client?.[0]?.client_info?.android_client_info?.package_name;
const oauthClients = googleServices.client?.flatMap((client) => client.oauth_client || []) || [];

if (packageName !== "com.modrek.plus") fail(`Android package mismatch: ${packageName || "missing"}`);
if (packageJson.dependencies?.["@capgo/capacitor-social-login"]) fail("Legacy @capgo/capacitor-social-login must not be bundled; it requests Google authorization/access tokens before Supabase id_token exchange");
if (packageJson.dependencies?.["@lovable.dev/cloud-auth-js"]) fail("Lovable Cloud auth package must not be bundled in the production Android app");
if (packageJson.dependencies?.["@capacitor/browser"]) fail("@capacitor/browser must not be bundled in Android auth builds");
if (!mainActivity.includes("registerPlugin(ModrekGoogleAuthPlugin.class)")) fail("ModrekGoogleAuthPlugin is not registered in MainActivity");
if (mainActivity.includes("SocialLoginPlugin") || mainActivity.includes("ModifiedMainActivityForSocialLoginPlugin") || mainActivity.includes("handleGoogleLoginIntent")) fail("MainActivity still contains the legacy @capgo Google authorization flow");
if (mainActivity.includes("BrowserPlugin")) fail("MainActivity must not register BrowserPlugin for Google auth");
if (mainActivity.includes("openExternal(") || mainActivity.includes("Intent.URI_INTENT_SCHEME")) fail("MainActivity must not force OAuth URLs into external browser intents");
if (manifest.includes('android:scheme="com.modrek.plus" android:host="oauth-callback"')) fail("Native Google Login must not depend on custom-scheme OAuth callbacks");
if (!capacitorConfig.includes("androidScheme: 'https'")) fail("Capacitor Android scheme must remain https for stable WebView auth storage");
if (capacitorConfig.includes("lovable.app") || capacitorConfig.includes("lovableproject.com")) fail("Capacitor production config must not contain Lovable preview domains");
if (!authRuntime.includes("GOOGLE_AUTH_WEB_CLIENT_ID")) fail("Google web client ID must be centralized in googleAuthRuntime.ts");
if (!nativeGoogleAuth.includes('registerPlugin<ModrekGoogleAuthPlugin>("ModrekGoogleAuth")')) fail("Native Google ID-token plugin bridge is missing");
if (!authRuntime.includes("nonceDigest") || !useAuth.includes("createGoogleOAuthNoncePair")) fail("Native Google auth must pass a SHA-256 nonce digest to Google and raw nonce to auth");
if (!useAuth.includes("getGoogleAuthRuntimeHealth")) fail("Runtime Google Auth health check is not wired into sign-in");
if (useAuth.includes("Browser.open") || useAuth.includes("@capacitor/browser") || useAuth.includes("native_browser_fallback_opened")) fail("Native Google auth must never open Browser tabs or Chrome Custom Tabs");
if (useAuth.includes("native_google_plugin_failed_fallback")) fail("Native Google auth must not fall back to browser OAuth after account selection");
if (useAuth.includes("@capgo/capacitor-social-login") || useAuth.includes("SocialLogin.login") || useAuth.includes("SocialLogin.initialize")) fail("Native Google auth must not use the legacy @capgo access-token flow");
if (capacitorInit.includes("oauth-callback") || capacitorInit.includes("modrek:native-oauth-url")) fail("Capacitor init must not handle browser OAuth callback URLs for native Google login");
if (capacitorBuild.includes("capacitor-browser") || capacitorSettings.includes("capacitor-browser")) fail("Android project must not include capacitor-browser");
if (capacitorBuild.includes("capgo-capacitor-social-login") || capacitorSettings.includes("capgo-capacitor-social-login")) fail("Android project must not include the legacy @capgo social login module");

// Production hardening: no Lovable preview domains may leak into runtime/native config.
const lovableDomainScan = [
  ["capacitor.config.ts", capacitorConfig],
  ["AndroidManifest.xml", manifest],
  ["MainActivity.java", mainActivity],
  ["googleAuthRuntime.ts", authRuntime],
  ["nativeGoogleAuth.ts", nativeGoogleAuth],
  ["useAuth.tsx", useAuth],
  ["capacitor-init.ts", capacitorInit],
];
for (const [name, body] of lovableDomainScan) {
  if (/modrek-plus\.lovable\.app|lovableproject\.com/.test(body)) {
    fail(`${name} contains a Lovable preview domain reference — production must use modrekplus.com only`);
  }
}

if (oauthClients.length === 0) {
  fail("google-services.json has no oauth_client entries. Add the production Android OAuth client for com.modrek.plus with the release SHA-1/SHA-256 and the Web OAuth client used by VITE_GOOGLE_WEB_CLIENT_ID before building Android.");
}

const expectedWebClientId = process.env.VITE_GOOGLE_WEB_CLIENT_ID || "233651659157-rt9khk04uo1enfpbmfs5b1c787q7jj5n.apps.googleusercontent.com";
const hasExpectedWebClient = oauthClients.some((client) => client.client_type === 3 && client.client_id === expectedWebClientId)
  || googleServices.client?.some((client) => (client.services?.appinvite_service?.other_platform_oauth_client || [])
    .some((oauthClient) => oauthClient.client_type === 3 && oauthClient.client_id === expectedWebClientId));

if (!hasExpectedWebClient) {
  fail(`google-services.json does not contain the configured Web OAuth client ID: ${expectedWebClientId}`);
}

if (!process.exitCode) {
  console.info("[google-auth-config] Google Auth Android configuration checks passed.");
}