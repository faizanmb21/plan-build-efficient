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
  workStartTime?: string | null;
  workEndTime?: string | null;
  workingDays?: string[] | null;
  accessToken?: string;
}

// "HH:MM" -> minutes since midnight, or null
function parseHm(v?: string | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function dailyHoursFromRange(start?: string | null, end?: string | null): number | null {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60; // wrap past midnight
  return Math.round((diff / 60) * 100) / 100;
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
    const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const workingDays =
      Array.isArray(data.workingDays) && data.workingDays.length > 0
        ? Array.from(new Set(data.workingDays.map((d) => String(d).toLowerCase()).filter((d) => validDays.includes(d))))
        : null;
    const workStart = parseHm(data.workStartTime) !== null ? data.workStartTime!.trim() : null;
    const workEnd = parseHm(data.workEndTime) !== null ? data.workEndTime!.trim() : null;
    const expectedHours = dailyHoursFromRange(workStart, workEnd);

    const profilePayload: Record<string, unknown> = {
      id: userId,
      full_name: fullName,
      franchise_id: franchiseId,
    };
    if (expectedHours !== null) profilePayload.expected_daily_hours = expectedHours;
    if (workingDays) profilePayload.working_days = workingDays;
    if (workStart) profilePayload.work_start_time = workStart;
    if (workEnd) profilePayload.work_end_time = workEnd;

    await supabaseAdmin
      .from("profiles")
      .upsert(profilePayload as never, { onConflict: "id" });

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

    // Preserve existing user_metadata (updateUserById replaces the whole object).
    const { data: existing } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const prevMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
      email_confirm: true,
      user_metadata: { ...prevMeta, must_change_password: true },
    });
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, password: data.newPassword };
  });

export const listTeam = createServerFn({ method: "POST" })
  .inputValidator((d: ListInput) => d ?? {})
  .handler(async ({ data }) => {
  const ctx = await getCallerContext(data?.accessToken);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, members: [] };

  // Pull profiles + roles + auth emails (paginated to handle >1000 users)
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, franchise_id, created_at"),
    supabaseAdmin.from("user_roles").select("user_id, role, franchise_id"),
  ]);

  const emailById = new Map<string, string>();
  let authPage = 1;
  while (true) {
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ page: authPage, perPage: 200 });
    const users = usersData?.users ?? [];
    users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
    if (users.length < 200) break;
    authPage += 1;
  }

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

interface DeleteInput {
  userId: string;
  accessToken?: string;
}

export const deleteUserAccount = createServerFn({ method: "POST" })
  .inputValidator((d: DeleteInput) => d)
  .handler(async ({ data }) => {
    const ctx = await getCallerContext(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    if (!ctx.isCeo) return { ok: false as const, error: "Only CEO can delete accounts" };
    if (data.userId === ctx.callerId) {
      return { ok: false as const, error: "You cannot delete your own account" };
    }

    // Clear any franchise.manager_id references first
    await supabaseAdmin
      .from("franchises")
      .update({ manager_id: null })
      .eq("manager_id", data.userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const };
  });

interface BulkCreateInput {
  franchiseId: string;
  count: number;
  namePrefix?: string;
  workStartTime?: string | null;
  workEndTime?: string | null;
  workingDays?: string[] | null;
  accessToken?: string;
}


function slugify(s: string, max = 16) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, max);
}

function genPw(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const syms = "!@#$";
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len - 2; i++) out += chars[buf[i] % chars.length];
  out += syms[buf[len - 2] % syms.length];
  out += String(buf[len - 1] % 10);
  return out;
}

export const createUserAccountsBulk = createServerFn({ method: "POST" })
  .inputValidator((d: BulkCreateInput) => d)
  .handler(async ({ data }) => {
    const ctx = await getCallerContext(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error, created: [], failed: [] };

    let franchiseId = data.franchiseId;
    if (ctx.isIncharge && !ctx.isCeo) {
      if (!ctx.inchargeFranchise) {
        return { ok: false as const, error: "You are not attached to a franchise", created: [], failed: [] };
      }
      franchiseId = ctx.inchargeFranchise;
    } else if (!ctx.isCeo) {
      return { ok: false as const, error: "Not authorized", created: [], failed: [] };
    }

    const count = Math.max(1, Math.min(50, Math.floor(data.count)));
    if (!franchiseId) {
      return { ok: false as const, error: "Franchise required", created: [], failed: [] };
    }

    const { data: fr } = await supabaseAdmin
      .from("franchises")
      .select("name")
      .eq("id", franchiseId)
      .maybeSingle();
    const franchiseSlug = slugify(fr?.name ?? "franchise") || "franchise";

    // Find current max member number for this franchise to continue numbering
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("franchise_id", franchiseId);
    const prefix = (data.namePrefix?.trim() || "Member");
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)$`, "i");
    let maxN = 0;
    for (const row of existing ?? []) {
      const m = (row.full_name ?? "").match(re);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }

    const created: { name: string; email: string; password: string }[] = [];
    const failed: { index: number; error: string }[] = [];

    for (let i = 1; i <= count; i++) {
      const n = maxN + i;
      const fullName = `${prefix} ${n}`;
      const rand = Math.random().toString(36).slice(2, 6);
      const email = `member${n}.${franchiseSlug}.${rand}@irmacademy.app`;
      const password = genPw();

      try {
        const { data: createdUser, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, must_change_password: true },
        });
        if (cErr || !createdUser?.user) {
          failed.push({ index: i, error: cErr?.message ?? "Failed to create" });
          continue;
        }
        const uid = createdUser.user.id;
        const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        const workingDays =
          Array.isArray(data.workingDays) && data.workingDays.length > 0
            ? Array.from(new Set(data.workingDays.map((d) => String(d).toLowerCase()).filter((d) => validDays.includes(d))))
            : ["mon", "tue", "wed", "thu", "fri"];
        const workStart = parseHm(data.workStartTime) !== null ? data.workStartTime!.trim() : null;
        const workEnd = parseHm(data.workEndTime) !== null ? data.workEndTime!.trim() : null;
        const dailyFromRange = dailyHoursFromRange(workStart, workEnd);
        const expected = dailyFromRange ?? 8;
        const profilePayload: Record<string, unknown> = {
          id: uid,
          full_name: fullName,
          franchise_id: franchiseId,
          expected_daily_hours: expected,
          working_days: workingDays,
        };
        if (workStart) profilePayload.work_start_time = workStart;
        if (workEnd) profilePayload.work_end_time = workEnd;
        await supabaseAdmin
          .from("profiles")
          .upsert(profilePayload as never, { onConflict: "id" });

        const { error: rErr } = await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: uid, role: "member", franchise_id: franchiseId },
            { onConflict: "user_id,role" },
          );
        if (rErr) {
          failed.push({ index: i, error: rErr.message });
          continue;
        }
        created.push({ name: fullName, email, password });
      } catch (e: any) {
        failed.push({ index: i, error: e?.message ?? "Unexpected error" });
      }
    }

    return { ok: true as const, created, failed };
  });
