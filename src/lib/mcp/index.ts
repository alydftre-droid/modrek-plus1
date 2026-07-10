import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfileTool from "./tools/get-my-profile";
import getMyWalletTool from "./tools/get-my-wallet";
import listMyNotificationsTool from "./tools/list-my-notifications";
import listMyExamsTool from "./tools/list-my-exams";

// Direct Supabase issuer (never the .lovable.cloud proxy). Built from the project
// ref that Vite inlines at build time so this module stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "modrek-plus-mcp",
  title: "Mudrik Plus",
  version: "0.1.0",
  instructions:
    "Read-only tools for the signed-in Mudrik Plus user. Use get_my_profile to read the user's account, get_my_wallet for their wallet balance, list_my_notifications for recent notifications, and list_my_exams for exams they can currently access. Every tool runs as the authenticated user under Row-Level Security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfileTool, getMyWalletTool, listMyNotificationsTool, listMyExamsTool],
});
