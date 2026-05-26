import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type Role = "ceo" | "incharge" | "member" | "qa";

interface CreateInput {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  franchiseId?: string | null;
  accessToken?: string;
}

interface ResetInput {
  userId: string;
  newPassword: string;
  accessToken?: string;
}

interface ListInput {
  accessToken?: string;
}

async function getCallerContext(explicitToken?: string) {
  let token = explicitToken;
  if (!token) {
    const req = getRequest();
    const auth = req?.headers?.get("authorization");
    if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);
  }
  if (!token) {
    return { ok: false as const, error: "Unauthorized" };
  }
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false as const, error: "Server not configured" };
  }
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, error: "Invalid session" };
  const callerId = data.user.id;

  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("role, franchise_id")
    .eq("user_id", callerId);
  const roles = (roleRows ?? []).map((r) => r.role as Role);
  const inchargeFranchise =
    (roleRows ?? []).find((r) => r.role === "incharge")?.franchise_id ?? null;

  return {
    ok: true as const,
    callerId,
    roles,
    isCeo: roles.includes("ceo"),
    isIncharge: roles.includes("incharge"),
    inchargeFranchise,
  };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match?.id) return match.id;
    if (users.length < 200) return null;
    page += 1;
  }
}

export const createUserAccount = createServerFn({ method: "POST" })
  .inputValidator((d: CreateInput) => d)
  .handler(async ({ data }) => {
    const ctx = await getCallerContext(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const email = data.email.trim().toLowerCase();
    const fullName = data.fullName.trim();
    const password = data.password;
    const role = data.role;
    let franchiseId: string | null = data.franchiseId ?? null;

    if (!email || !password || password.length < 8 || !fullName) {
      return { ok: false as const, error: "Email, full name and an 8+ char password are required" };
    }

    // Authorization
    if (ctx.isCeo) {
      // CEO can create anyone
      if (role !== "ceo" && role !== "qa" && !franchiseId && role !== "incharge") {
        // member without franchise — allow but warn (they'll need a franchise later)
      }
    } else if (ctx.isIncharge) {
      if (role !== "member") {
        return { ok: false as const, error: "Incharge can only create member accounts" };
      }
      if (!ctx.inchargeFranchise) {
        return { ok: false as const, error: "You are not attached to a franchise" };
      }
      franchiseId = ctx.inchargeFranchise;
    } else {
      return { ok: false as const, error: "Not authorized" };
    }

    // Create or update auth user
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true },
    });

    if (!createErr && created?.user) {
      userId = created.user.id;
    } else {
      // Maybe the user already exists — reset their password instead
      userId = await findUserIdByEmail(email);
      if (!userId) {
        return { ok: false as const, error: createErr?.message ?? "Failed to create user" };
      }
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, must_change_password: true },
      });
      if (upErr) return { ok: false as const, error: upErr.message };
    }

    // Upsert profile (the handle_new_user trigger fires on insert, but be defensive)
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, full_name: fullName, franchise_id: franchiseId },
        { onConflict: "id" },
      );

    // Insert role
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role, franchise_id: franchiseId },
        { onConflict: "user_id,role" },
      );
    if (roleErr) return { ok: false as const, error: roleErr.message };

    // If incharge, also set franchise.manager_id
    if (role === "incharge" && franchiseId) {
      await supabaseAdmin
        .from("franchises")
        .update({ manager_id: userId })
        .eq("id", franchiseId);
    }

    return {
      ok: true as const,
      userId,
      email,
      password,
      fullName,
      role,
    };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .inputValidator((d: ResetInput) => d)
  .handler(async ({ data }) => {
    const ctx = await getCallerContext(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    if (!data.newPassword || data.newPassword.length < 8) {
      return { ok: false as const, error: "Password must be at least 8 characters" };
    }

    if (!ctx.isCeo) {
      if (!ctx.isIncharge) return { ok: false as const, error: "Not authorized" };
      // Incharge can only reset their own franchise members
      const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("franchise_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!target || target.franchise_id !== ctx.inchargeFranchise) {
        return { ok: false as const, error: "Can only reset passwords for your franchise" };
      }
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId);
      const tRoles = (targetRoles ?? []).map((r) => r.role);
      if (tRoles.some((r) => r === "ceo" || r === "incharge")) {
        return { ok: false as const, error: "Cannot reset a CEO or incharge password" };
      }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
      user_metadata: { must_change_password: true },
    });
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, password: data.newPassword };
  });

export const listTeam = createServerFn({ method: "POST" }).handler(async () => {
  const ctx = await getCallerContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, members: [] };

  // Pull profiles + roles + auth emails
  const [{ data: profiles }, { data: roles }, { data: usersData }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, franchise_id, created_at"),
    supabaseAdmin.from("user_roles").select("user_id, role, franchise_id"),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const emailById = new Map<string, string>();
  (usersData?.users ?? []).forEach((u) => {
    if (u.email) emailById.set(u.id, u.email);
  });

  const rolesByUser = new Map<string, Role[]>();
  (roles ?? []).forEach((r) => {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role as Role);
    rolesByUser.set(r.user_id, list);
  });

  let rows = (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: emailById.get(p.id) ?? null,
    franchise_id: p.franchise_id,
    roles: rolesByUser.get(p.id) ?? [],
    created_at: p.created_at,
  }));

  if (!ctx.isCeo) {
    if (ctx.isIncharge && ctx.inchargeFranchise) {
      rows = rows.filter((r) => r.franchise_id === ctx.inchargeFranchise);
    } else {
      rows = [];
    }
  }

  return { ok: true as const, members: rows };
});
