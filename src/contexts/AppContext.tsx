import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Lang, translations, TranslationKey } from "@/i18n/translations";

interface Profile {
  id: string;
  display_name: string | null;
  language: Lang;
  bank_code: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

type Dict = Record<TranslationKey, any>;

interface Ctx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  lang: Lang;
  t: Dict;
  role: "teacher" | "student" | null;
  setLang: (l: Lang) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<Ctx | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<"teacher" | "student" | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState<Lang>(
    (typeof window !== "undefined" && (localStorage.getItem("lang") as Lang)) || "en"
  );

  const loadProfile = async (uid: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) {
      // Previously silent: a failed fetch here left `profile` stale with no
      // signal to the caller, so saves could appear to "succeed" while the
      // context never actually refreshed.
      console.error("Failed to load profile:", error.message);
    } else if (data) {
      const safeLang: Lang = data.language === "en" ? "en" : "vi";
      setProfile({ ...(data as Profile), language: safeLang });
      if (data.language) {
        setLangState(safeLang);
        localStorage.setItem("lang", safeLang);
      }
    }

    const { data: roles, error: rolesError } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    if (rolesError) {
      // Previously silent: a failed fetch here silently defaulted `role` to
      // null, which can lock a legitimate teacher/student out of
      // role-gated features with no visible error.
      console.error("Failed to load user roles:", rolesError.message);
    }
    const list = (roles || []).map((r: any) => r.role);
    setRole(list.includes("teacher") ? "teacher" : list.includes("student") ? "student" : null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) await loadProfile(sess.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (event === "SIGNED_IN" && sess?.user) {
        // Gate `loading` around this fetch too — otherwise there's a brief
        // window right after login where `role` is still null but `loading`
        // already reads false, which would make a role-guard incorrectly
        // treat a freshly-signed-in teacher/student as having no role yet.
        setLoading(true);
        loadProfile(sess.user.id).finally(() => setLoading(false));
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setRole(null);
      }
    });
    
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const KEY = "session_started_at";
    let startedAt = Number(localStorage.getItem(KEY) || 0);
    if (!startedAt) {
      startedAt = Date.now();
      localStorage.setItem(KEY, String(startedAt));
    }
    const ONE_HOUR = 60 * 60 * 1000;
    const remaining = startedAt + ONE_HOUR - Date.now();
    
    if (remaining <= 0) {
      localStorage.removeItem(KEY);
      supabase.auth.signOut();
      return;
    }
    
    const timer = window.setTimeout(() => {
      localStorage.removeItem(KEY);
      supabase.auth.signOut();
    }, remaining);
    
    return () => clearTimeout(timer);
  }, [session]);

  const setLang = async (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
    setProfile((p) => (p ? { ...p, language: l } : p));
    if (user) {
      const { error } = await supabase.from("profiles").update({ language: l }).eq("id", user.id);
      if (error) console.warn("language save failed:", error.message);
    }
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  const signOut = async () => {
    localStorage.removeItem("session_started_at");
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
    setSession(null);
    setUser(null);
  };

  const getDynamicTranslations = () => {
    const baseDict = { ...(translations[lang] as Dict) };
    // 🌟 Đọc tên thương hiệu động từ metadata của tài khoản user
    const customBrandName = user?.user_metadata?.brand_name;
    if (role === "teacher" && customBrandName) {
      baseDict.appName = "Apex Academy"; // Thay thế bằng tên thương hiệu động
    }
    return baseDict;
  };

  return (
    <AppContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        lang,
        t: getDynamicTranslations(),
        role,
        setLang,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}