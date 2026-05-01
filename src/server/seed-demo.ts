import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DemoAccount = { email: string; full_name: string };

const PASSWORD = "Academy@123";

const ACCOUNTS: DemoAccount[] = [
  { email: "ceo@irmacademy.test", full_name: "Imran Iqbal (CEO)" },
  { email: "incharge.sargodha@irmacademy.test", full_name: "Sargodha Incharge" },
  { email: "incharge.lahore@irmacademy.test", full_name: "Lahore Incharge" },
  { email: "incharge.pdk@irmacademy.test", full_name: "PDK Incharge" },
  { email: "qa@irmacademy.test", full_name: "QA Reviewer" },
  { email: "you@irmacademy.test", full_name: "Demo Creator (You)" },
  ...Array.from({ length: 20 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { email: `member${n}@irmacademy.test`, full_name: `Member ${n}` };
  }),
];

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match?.id) return match.id;
    if (users.length < 200) return null;

    page += 1;
  }
}

async function ensureDemoAccount(acc: DemoAccount) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: acc.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: acc.full_name },
  });

  if (!error && data?.user) {
    return { status: "created" as const };
  }

  const msg = error?.message || "";
  const alreadyExists =
    msg.toLowerCase().includes("already") ||
    msg.toLowerCase().includes("registered") ||
    msg.toLowerCase().includes("exists");

  if (!alreadyExists) {
    throw new Error(msg || "Unknown account creation error");
  }

  const userId = await findUserIdByEmail(acc.email);
  if (!userId) {
    throw new Error("Account exists but could not be looked up for password reset");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: acc.full_name },
  });

  if (updateError) {
    throw updateError;
  }

  return { status: "reset" as const };
}

export const seedDemo = createServerFn({ method: "POST" }).handler(async () => {
  const created: string[] = [];
  const reset: string[] = [];
  const failed: { email: string; error: string }[] = [];

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false as const,
      created,
      reset,
      failed,
      error:
        "Seeder is unavailable in this preview because the backend admin secret is not exposed here yet. Open the published app and run the seeder there.",
    };
  }

  for (const acc of ACCOUNTS) {
    try {
      const result = await ensureDemoAccount(acc);
      if (result.status === "created") created.push(acc.email);
      else reset.push(acc.email);
    } catch (error) {
      failed.push({
        email: acc.email,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const { data: seedResult, error: seedErr } = await supabaseAdmin.rpc("seed_demo_content");
  if (seedErr) {
    return {
      ok: false as const,
      created,
      reset,
      failed,
      error: `Content seed failed: ${seedErr.message}`,
    };
  }

  return {
    ok: true as const,
    created,
    reset,
    failed,
    seedResult,
    accounts: ACCOUNTS.map((a) => ({ email: a.email, password: PASSWORD })),
  };
});
