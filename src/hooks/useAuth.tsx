import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "student" | "teacher" | "admin" | "support";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isLoading: boolean;
  isBanned: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  signUpTeacher: (data: TeacherSignUpData) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  stage?: string;
  grade?: string;
  section?: string;
}

interface TeacherSignUpData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  schoolName?: string;
  employeeId?: string;
  stage: "preparatory" | "secondary";
  grades: string[];
  subject: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBanned, setIsBanned] = useState(false);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleError) {
        console.error("Error fetching role:", roleError);
        return null;
      }

      if (roleData) {
        return roleData.role as AppRole;
      }

      return null;
    } catch (error) {
      console.error("Error in fetchUserRole:", error);
      return null;
    }
  };

  const checkIfBanned = async (userId: string) => {
    try {
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("is_banned")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error checking ban status:", error);
        return false;
      }

      return profileData?.is_banned || false;
    } catch (error) {
      console.error("Error in checkIfBanned:", error);
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        // Defer Supabase calls with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(async () => {
            if (!isMounted) return;
            const userRole = await fetchUserRole(session.user.id);
            if (!isMounted) return;
            setRole(userRole);
            
            const banned = await checkIfBanned(session.user.id);
            if (!isMounted) return;
            setIsBanned(banned);
            
            setIsLoading(false);
          }, 0);
        } else {
          setRole(null);
          setIsBanned(false);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Wait for BOTH role and ban status before setting isLoading to false
        const [userRole, banned] = await Promise.all([
          fetchUserRole(session.user.id),
          checkIfBanned(session.user.id),
        ]);
        if (!isMounted) return;
        setRole(userRole);
        setIsBanned(banned);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        // Handle specific error cases
        if (error.message.includes("Invalid login credentials")) {
          return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
        }
        if (error.message.includes("Email not confirmed")) {
          return { error: "يرجى تأكيد بريدك الإلكتروني أولاً" };
        }
        return { error: error.message };
      }

      if (data.user) {
        // Check if user is banned
        const banned = await checkIfBanned(data.user.id);
        if (banned) {
          await supabase.auth.signOut();
          return { error: "حسابك موقوف – تواصل مع الدعم" };
        }
      }

      return { error: null };
    } catch (error: any) {
      console.error("Sign in error:", error);
      return { error: "حدث خطأ أثناء تسجيل الدخول" };
    }
  };

  const signUp = async (data: SignUpData): Promise<{ error: string | null }> => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: data.fullName,
            phone: data.phone,
            stage: data.stage,
            grade: data.grade,
            section: data.section,
            role: "student",
          },
        },
      });

      if (error) {
        if (error.message.includes("User already registered")) {
          return { error: "هذا البريد الإلكتروني مسجل بالفعل" };
        }
        if (error.message.includes("Password should be at least")) {
          return { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
        }
        return { error: error.message };
      }

      return { error: null };
    } catch (error: any) {
      console.error("Sign up error:", error);
      return { error: "حدث خطأ أثناء إنشاء الحساب" };
    }
  };

  const signUpTeacher = async (data: TeacherSignUpData): Promise<{ error: string | null }> => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      // 1. Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: data.fullName,
            phone: data.phone,
            school_name: data.schoolName,
            employee_id: data.employeeId,
            role: "teacher",
          },
        },
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
          return { error: "هذا البريد الإلكتروني مسجل بالفعل" };
        }
        return { error: authError.message };
      }

      // 2. Create the teacher request with stage, grades, and subject
      if (authData.user) {
        const { error: requestError } = await supabase.from("teacher_requests").insert({
          user_id: authData.user.id,
          full_name: data.fullName,
          email: data.email.trim(),
          phone: data.phone || null,
          school_name: data.schoolName || null,
          employee_id: data.employeeId || null,
          status: "pending",
          assigned_stages: [data.stage],
          assigned_grades: data.grades,
          assigned_category: data.subject,
        });

        if (requestError) {
          console.error("Error creating teacher request:", requestError);
          // Don't return error here, the account was created successfully
        }
      }

      return { error: null };
    } catch (error: any) {
      console.error("Teacher sign up error:", error);
      return { error: "حدث خطأ أثناء إنشاء الحساب" };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsBanned(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isLoading,
        isBanned,
        signIn,
        signUp,
        signUpTeacher,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};


