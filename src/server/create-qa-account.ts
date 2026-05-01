import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PASSWORD = "QA-Reviewer-2026!Strong#Pass";
const EMAIL = "qa@irmacademy.test";
const FULL_NAME = "QA Reviewer";

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

export const createQaAccount = createServerFn({ method: "POST" }).handler(async () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false as const,
      error: "Backend admin secret is not exposed in this preview. Open the published app and try again.",
    };
  }

  let userId: string | null = null;
  let status: "created" | "reset" = "created";

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });

  if (!error && data?.user) {
    userId = data.user.id;
  } else {
    userId = await findUserIdByEmail(EMAIL);
    if (!userId) {
      return { ok: false as const, error: error?.message || "Failed to create QA user" };
    }
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (upErr) return { ok: false as const, error: upErr.message };
    status = "reset";
  }

  // Ensure profile + qa role
  await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, full_name: FULL_NAME }, { onConflict: "id" });
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "qa" }, { onConflict: "user_id,role" });

  return {
    ok: true as const,
    status,
    email: EMAIL,
    password: PASSWORD,
  };
});
