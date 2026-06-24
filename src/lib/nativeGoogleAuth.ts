import { registerPlugin } from "@capacitor/core";

type NativeGoogleProfile = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  familyName?: string | null;
  givenName?: string | null;
  imageUrl?: string | null;
};

type NativeGoogleIdTokenResult = {
  idToken: string;
  responseType: "id_token";
  profile?: NativeGoogleProfile;
};

type ModrekGoogleAuthPlugin = {
  signIn(options: { webClientId: string; nonce: string }): Promise<NativeGoogleIdTokenResult>;
  clearCredentialState(): Promise<{ cleared: boolean }>;
};

const ModrekGoogleAuth = registerPlugin<ModrekGoogleAuthPlugin>("ModrekGoogleAuth");

export function signInNativeGoogleIdToken(webClientId: string, nonce: string) {
  return ModrekGoogleAuth.signIn({ webClientId, nonce });
}

export async function clearNativeGoogleCredentialState() {
  try {
    await ModrekGoogleAuth.clearCredentialState();
  } catch {
    // Clearing stale credentials is best-effort only; the next sign-in attempt
    // still opens Google Credential Manager and returns the real native error.
  }
}