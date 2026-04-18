import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PASSWORD = "Academy@123";

const ACCOUNTS: { email: string; full_name: string }[] = [
  { email: "ceo@irmacademy.test", full_name: "Imran Iqbal (CEO)" },
  { email: "incharge.sargodha@irmacademy.test", full_name: "Sargodha Incharge" },
  { email: "incharge.lahore@irmacademy.test", full_name: "Lahore Incharge" },
  { email: "incharge.pdk@irmacademy.test", full_name: "PDK Incharge" },
  { email: "you@irmacademy.test", full_name: "Demo Creator (You)" },
  ...Array.from({ length: 20 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { email: `member${n}@irmacademy.test`, full_name: `Member ${n}` };
  }),
];

export const seedDemo = createServerFn({ method: "POST" }).handler(async () => {
  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { email: string; error: string }[] = [];

  // 1. Create auth users (idempotent: skip if exists)
  for (const acc of ACCOUNTS) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: acc.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: acc.full_name },
    });

    if (error) {
      const msg = error.message || "";
      if (
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("registered") ||
        msg.toLowerCase().includes("exists")
      ) {
        skipped.push(acc.email);
      } else {
        failed.push({ email: acc.email, error: msg });
      }
    } else if (data?.user) {
      created.push(acc.email);
    }
  }

  // 2. Run the SQL seeder (franchises, courses, lessons, assignments, progress, submissions)
  const { data: seedResult, error: seedErr } = await supabaseAdmin.rpc("seed_demo_content");
  if (seedErr) {
    return {
      ok: false as const,
      created,
      skipped,
      failed,
      error: `Content seed failed: ${seedErr.message}`,
    };
  }

  return {
    ok: true as const,
    created,
    skipped,
    failed,
    seedResult,
    accounts: ACCOUNTS.map((a) => ({ email: a.email, password: PASSWORD })),
  };
});
