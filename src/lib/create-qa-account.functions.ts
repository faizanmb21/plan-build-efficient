import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const InputSchema = z.object({
  accessToken: z.string().min(10),
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(120),
  franchiseIds: z.array(z.string().uuid()).max(50).default([]),
});

const ListInputSchema = z.object({
  accessToken: z.string().min(10),
});

const DeleteInputSchema = z.object({
  accessToken: z.string().min(10),
  userId: z.string().uuid(),
});

function generatePassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%^&*";
  let out = "";
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < len - 2; i++) out += chars[buf[i] % chars.length];
  out += symbols[buf[len - 2] % symbols.length];
  out += String(buf[len - 1] % 10);
  return out;
}

async function verifyCeo(accessToken: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, error: "Server not configured (missing Supabase URL/key)." };
  }
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return { ok: false, error: "Your session has expired. Please sign in again." };
  const userId = data.user.id;
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "ceo")
    .maybeSingle();
  if (!roleRow) return { ok: false, error: "Only the CEO can create QA accounts." };
  return { ok: true, userId };
}

export const createQaAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false as const, error: "Backend admin secret is not configured on the server." };
      }

      const auth = await verifyCeo(data.accessToken);
      if (!auth.ok) return { ok: false as const, error: auth.error };

      const domain = data.email.split("@")[1]?.toLowerCase() ?? "";
      const tld = domain.split(".").pop() ?? "";
      if (["test", "example", "invalid", "localhost"].includes(tld)) {
        return {
          ok: false as const,
          error: `Email domain .${tld} is not accepted by the auth provider. Pick a real domain.`,
        };
      }

      const password = generatePassword();
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName, must_change_password: true },
      });

      if (error || !created?.user) {
        console.error("[createQaAccount] createUser failed", error);
        return { ok: false as const, error: error?.message || "Failed to create user" };
      }
      const newUserId = created.user.id;

      const { error: pErr } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: newUserId, full_name: data.fullName }, { onConflict: "id" });
      if (pErr) console.error("[createQaAccount] profile upsert", pErr);

      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: newUserId, role: "qa" }, { onConflict: "user_id,role" });
      if (rErr) {
        console.error("[createQaAccount] role upsert", rErr);
        return { ok: false as const, error: `Role assignment failed: ${rErr.message}` };
      }

      if (data.franchiseIds.length > 0) {
        const rows = data.franchiseIds.map((fid) => ({
          user_id: newUserId,
          franchise_id: fid,
          assigned_by: auth.userId,
        }));
        const { error: aerr } = await supabaseAdmin
          .from("qa_franchise_assignments")
          .insert(rows);
        if (aerr) {
          console.error("[createQaAccount] assignment insert", aerr);
          return {
            ok: false as const,
            error: `User created, but franchise scope failed: ${aerr.message}`,
          };
        }
      }

      return {
        ok: true as const,
        userId: newUserId,
        email: data.email,
        password,
      };
    } catch (e: any) {
      console.error("[createQaAccount] unhandled", e);
      return { ok: false as const, error: e?.message || "Unexpected server error" };
    }
  });

export const listQaReviewers = createServerFn({ method: "POST" })
  .inputValidator((input) => ListInputSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await verifyCeo(data.accessToken);
    if (!auth.ok) return { ok: false as const, error: auth.error, reviewers: [] };

    const { data: qaRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "qa");
    const ids = (qaRoles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { ok: true as const, reviewers: [] };

    const [{ data: profiles }, { data: assignments }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,full_name").in("id", ids),
      supabaseAdmin
        .from("qa_franchise_assignments")
        .select("user_id,franchise_id")
        .in("user_id", ids),
    ]);

    const emailMap: Record<string, string | null> = {};
    let page = 1;
    while (true) {
      const { data: usersPage, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = usersPage?.users ?? [];
      for (const u of users) {
        if (ids.includes(u.id)) emailMap[u.id] = u.email ?? null;
      }
      if (users.length < 200) break;
      page += 1;
      if (page > 20) break;
    }

    const reviewers = ids.map((id) => ({
      id,
      full_name: profiles?.find((p) => p.id === id)?.full_name ?? null,
      email: emailMap[id] ?? null,
      franchiseIds: (assignments ?? [])
        .filter((a) => a.user_id === id)
        .map((a) => a.franchise_id),
    }));

    return { ok: true as const, reviewers };
  });

export const deleteQaAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => DeleteInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false as const, error: "Backend admin secret is not configured on the server." };
      }
      const auth = await verifyCeo(data.accessToken);
      if (!auth.ok) return { ok: false as const, error: auth.error };

      // Confirm target really is a QA (don't allow deleting other roles via this endpoint)
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("role", "qa")
        .maybeSingle();
      if (!roleRow) return { ok: false as const, error: "User is not a QA reviewer." };

      // Remove scope, role, profile, then auth user (this revokes all sessions).
      await supabaseAdmin.from("qa_franchise_assignments").delete().eq("user_id", data.userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "qa");
      await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (delErr) {
        console.error("[deleteQaAccount] auth delete failed", delErr);
        return { ok: false as const, error: delErr.message };
      }
      return { ok: true as const };
    } catch (e: any) {
      console.error("[deleteQaAccount] unhandled", e);
      return { ok: false as const, error: e?.message || "Unexpected server error" };
    }
  });

const ChangeRoleSchema = z.object({
  accessToken: z.string().min(10),
  userId: z.string().uuid(),
  newRole: z.enum(["incharge", "member"]),
  franchiseId: z.string().uuid(),
  keepQa: z.boolean().optional().default(false),
});

export const changeQaRole = createServerFn({ method: "POST" })
  .inputValidator((input) => ChangeRoleSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false as const, error: "Backend admin secret is not configured on the server." };
      }
      const auth = await verifyCeo(data.accessToken);
      if (!auth.ok) return { ok: false as const, error: auth.error };

      // Confirm target is a QA
      const { data: qaRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("role", "qa")
        .maybeSingle();
      if (!qaRole) return { ok: false as const, error: "User is not a QA reviewer." };

      // Verify franchise exists
      const { data: fr } = await supabaseAdmin
        .from("franchises")
        .select("id")
        .eq("id", data.franchiseId)
        .maybeSingle();
      if (!fr) return { ok: false as const, error: "Franchise not found." };

      // Remove QA scope rows (no longer relevant once they leave QA)
      await supabaseAdmin.from("qa_franchise_assignments").delete().eq("user_id", data.userId);

      // Remove QA role
      const { error: dErr } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "qa");
      if (dErr) return { ok: false as const, error: dErr.message };

      // Add new role
      const { error: iErr } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: data.newRole, franchise_id: data.franchiseId },
          { onConflict: "user_id,role" },
        );
      if (iErr) return { ok: false as const, error: iErr.message };

      // Attach to franchise on profile
      await supabaseAdmin
        .from("profiles")
        .update({ franchise_id: data.franchiseId })
        .eq("id", data.userId);

      // If becoming incharge, set franchise.manager_id (don't overwrite if already set unless empty)
      if (data.newRole === "incharge") {
        await supabaseAdmin
          .from("franchises")
          .update({ manager_id: data.userId })
          .eq("id", data.franchiseId);
      }

      return { ok: true as const };
    } catch (e: any) {
      console.error("[changeQaRole] unhandled", e);
      return { ok: false as const, error: e?.message || "Unexpected server error" };
    }
  });
