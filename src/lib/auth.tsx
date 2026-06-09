import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "ceo" | "incharge" | "member" | "qa";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  franchise_id: string | null;
  avatar_url: string | null;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  viewAsFranchiseId: string | null;
  setViewAsFranchiseId: (id: string | null) => void;
  viewAsMemberId: string | null;
  setViewAsMemberId: (id: string | null) => void;
}

const AuthContext = React.createContext<AuthState | null>(null);
const VIEW_AS_KEY = "lovable.viewAsFranchiseId";
const VIEW_AS_MEMBER_KEY = "lovable.viewAsMemberId";


const ROLE_PRIORITY: AppRole[] = ["ceo", "incharge", "qa", "member"];

function pickPrimary(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [roles, setRoles] = React.useState<AppRole[]>([]);

  const loadUserData = React.useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile | null) ?? null);
    setRoles(((roleRows as { role: AppRole }[] | null) ?? []).map((r) => r.role));
  }, []);

  const refresh = React.useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadUserData(data.session?.user.id);
  }, [loadUserData]);

  // Track this tab's "owned" session id so foreign cross-tab broadcasts
  // (Supabase fires onAuthStateChange across tabs via BroadcastChannel) do
  // not flip our session to another role's user.
  const ownUserIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (cancelled) return;
      const ownId = ownUserIdRef.current;
      const nextId = sess?.user.id ?? null;
      if (ownId && nextId && ownId !== nextId && event !== "SIGNED_OUT") {
        return;
      }
      ownUserIdRef.current = nextId;
      setSession(sess);
      setTimeout(() => {
        if (!cancelled) loadUserData(sess?.user.id);
      }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      ownUserIdRef.current = data.session?.user.id ?? null;
      setSession(data.session);
      loadUserData(data.session?.user.id).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const [viewAsFranchiseId, setViewAsFranchiseIdState] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(VIEW_AS_KEY);
  });
  const setViewAsFranchiseId = React.useCallback((id: string | null) => {
    setViewAsFranchiseIdState(id);
    if (typeof window === "undefined") return;
    if (id) window.sessionStorage.setItem(VIEW_AS_KEY, id);
    else window.sessionStorage.removeItem(VIEW_AS_KEY);
  }, []);

  const [viewAsMemberId, setViewAsMemberIdState] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(VIEW_AS_MEMBER_KEY);
  });
  const setViewAsMemberId = React.useCallback((id: string | null) => {
    setViewAsMemberIdState(id);
    if (typeof window === "undefined") return;
    if (id) window.sessionStorage.setItem(VIEW_AS_MEMBER_KEY, id);
    else window.sessionStorage.removeItem(VIEW_AS_MEMBER_KEY);
  }, []);

  const isCeo = roles.includes("ceo");

  // When CEO is viewing as a member, load that member's profile so the
  // member-shell pages see their data (franchise, name) rather than the CEO's.
  const [overrideMemberProfile, setOverrideMemberProfile] = React.useState<Profile | null>(null);
  React.useEffect(() => {
    if (!isCeo || !viewAsMemberId) {
      setOverrideMemberProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", viewAsMemberId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setOverrideMemberProfile((data as Profile | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [isCeo, viewAsMemberId]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRoles([]);
    setViewAsFranchiseId(null);
    setViewAsMemberId(null);
  }, [setViewAsFranchiseId, setViewAsMemberId]);

  const baseUser = session?.user ?? null;
  const effectiveUser: User | null =
    baseUser && isCeo && viewAsMemberId
      ? ({ ...baseUser, id: viewAsMemberId } as User)
      : baseUser;

  let effectiveProfile: Profile | null = profile;
  if (isCeo && viewAsMemberId) {
    effectiveProfile = overrideMemberProfile;
  } else if (profile && isCeo && viewAsFranchiseId) {
    effectiveProfile = { ...profile, franchise_id: viewAsFranchiseId };
  }

  const value: AuthState = {
    loading,
    session,
    user: effectiveUser,
    profile: effectiveProfile,
    roles,
    primaryRole: pickPrimary(roles),
    refresh,
    signOut,
    viewAsFranchiseId: isCeo ? viewAsFranchiseId : null,
    setViewAsFranchiseId,
    viewAsMemberId: isCeo ? viewAsMemberId : null,
    setViewAsMemberId,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function homeForRole(role: AppRole | null): string {
  if (role === "ceo") return "/ceo";
  if (role === "incharge") return "/incharge";
  if (role === "qa") return "/qa";
  if (role === "member") return "/member";
  return "/login";
}
