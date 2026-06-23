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
const useAuth = read("src/hooks/useAuth.tsx");
const packageJson = JSON.parse(read("package.json") || "{}");
const googleServices = JSON.parse(read("android/app/google-services.json") || "{}");

const packageName = googleServices.client?.[0]?.client_info?.android_client_info?.package_name;
const oauthClients = googleServices.client?.flatMap((client) => client.oauth_client || []) || [];

if (packageName !== "com.modrek.plus") fail(`Android package mismatch: ${packageName || "missing"}`);
if (!packageJson.dependencies?.["@capgo/capacitor-social-login"]) fail("Missing @capgo/capacitor-social-login dependency");
if (!packageJson.dependencies?.["@capacitor/browser"]) fail("Missing @capacitor/browser dependency");
if (!mainActivity.includes("implements ModifiedMainActivityForSocialLoginPlugin")) fail("MainActivity must implement ModifiedMainActivityForSocialLoginPlugin");
if (!mainActivity.includes("handleGoogleLoginIntent(requestCode, data)")) fail("MainActivity must forward Google authorization activity results");
if (!mainActivity.includes("registerPlugin(SocialLoginPlugin.class)")) fail("SocialLoginPlugin is not registered in MainActivity");
if (!manifest.includes('android:scheme="com.modrek.plus" android:host="oauth-callback"')) fail("Missing com.modrek.plus://oauth-callback intent-filter");
if (!capacitorConfig.includes("androidScheme: 'https'")) fail("Capacitor Android scheme must remain https for stable WebView auth storage");
if (!authRuntime.includes("GOOGLE_AUTH_WEB_CLIENT_ID")) fail("Google web client ID must be centralized in googleAuthRuntime.ts");
if (!useAuth.includes("getGoogleAuthRuntimeHealth")) fail("Runtime Google Auth health check is not wired into sign-in");
if (!useAuth.includes("native_browser_fallback_opened")) fail("Safe Browser fallback is not wired for native Google failures");

if (oauthClients.length === 0) {
  console.warn("[google-auth-config] google-services.json has no oauth_client entries. Native sign-in can still use the configured Web Client ID, but Google Cloud must include Android OAuth clients with the release SHA-1/SHA-256 for production reliability.");
}

if (!process.exitCode) {
  console.info("[google-auth-config] Google Auth Android configuration checks passed.");
}