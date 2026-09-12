import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tells the interface whether the signed-in person is using a preview (demo)
 * account. The answer always comes from the backend (`current_user_is_demo()`),
 * never from anything stored in the browser.
 *
 * This is only used to keep a couple of sensitive screens out of sight. Every
 * actual restriction is enforced on the server, so changing this value in the
 * browser grants nothing.
 */
export function useIsDemoAccount() {
  const { data, isLoading } = useQuery({
    queryKey: ["is-demo-account"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user?.id) return false;
      const { data: result, error } = await supabase.rpc("current_user_is_demo");
      if (error) return false;
      return result === true;
    },
  });

  return { isDemo: data === true, isLoading };
}
