import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(120),
  franchiseIds: z.array(z.string().uuid()).max(50).default([]),
});

function generatePassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%^&*";
  let out = "";
  const cryptoObj = globalThis.crypto;
  const buf = new Uint32Array(len);
  cryptoObj.getRandomValues(buf);
  for (let i = 0; i < len - 2; i++) out += chars[buf[i] % chars.length];
  out += symbols[buf[len - 2] % symbols.length];
  out += String(buf[len - 1] % 10);
  return out;
}

export const createQaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { ok: false as const, error: "Backend admin secret is not exposed in this preview. Open the published app and try again." };
    }

    // Authorize: caller must be CEO
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "ceo")
      .maybeSingle();
    if (!roleRow) {
      return { ok: false as const, error: "Only the CEO can create QA accounts." };
    }

    const password = generatePassword();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, must_change_password: true },
    });

    if (error || !created?.user) {
      return { ok: false as const, error: error?.message || "Failed to create user" };
    }
    const newUserId = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newUserId, full_name: data.fullName }, { onConflict: "id" });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newUserId, role: "qa" }, { onConflict: "user_id,role" });

    if (data.franchiseIds.length > 0) {
      const rows = data.franchiseIds.map((fid) => ({
        user_id: newUserId,
        franchise_id: fid,
        assigned_by: userId,
      }));
      const { error: aerr } = await supabaseAdmin
        .from("qa_franchise_assignments")
        .insert(rows);
      if (aerr) {
        return { ok: false as const, error: `User created, but franchise scope failed: ${aerr.message}` };
      }
    }

    return {
      ok: true as const,
      userId: newUserId,
      email: data.email,
      password,
    };
  });

export const listQaReviewers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "ceo")
      .maybeSingle();
    if (!roleRow) return { ok: false as const, error: "Forbidden" };

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

    // Fetch emails via admin listUsers (paginate)
    const emailMap: Record<string, string | null> = {};
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users ?? [];
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
