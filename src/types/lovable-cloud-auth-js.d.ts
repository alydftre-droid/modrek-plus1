declare module "@lovable.dev/cloud-auth-js" {
  export function createLovableAuth(): {
    signInWithOAuth: (
      provider: "google" | "apple" | "microsoft" | "lovable",
      options?: {
        redirect_uri?: string;
        extraParams?: Record<string, string>;
      },
    ) => Promise<{
      redirected?: boolean;
      error?: Error | string | null;
      tokens?: {
        access_token: string;
        refresh_token: string;
      };
    }>;
  };
}