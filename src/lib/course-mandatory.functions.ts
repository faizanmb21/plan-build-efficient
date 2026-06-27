import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { COURSE_MANDATORY_EDITOR_IDS } from "@/lib/access";

async function getCaller(explicitToken?: string) {
  let token = explicitToken;
  if (!token) {
    const req = getRequest();
    const auth = req?.headers?.get("authorization");
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  }
  if (!token) return { ok: false as const, error: "Unauthorized" };
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !KEY) return { ok: false as const, error: "Server not configured" };
  const client = createClient<Database>(SUPABASE_URL, KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, error: "Invalid session" };
  return { ok: true as const, userId: data.user.id };
}

async function assertCanEditMandatory(userId: string) {
  if (COURSE_MANDATORY_EDITOR_IDS.includes(userId)) return true;
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (roles ?? []).some((r) => r.role === "ceo");
}

export const setLessonRequiresSubmission = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { lessonId: string; value: boolean; accessToken?: string }) => d,
  )
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    if (!(await assertCanEditMandatory(ctx.userId))) {
      return { ok: false as const, error: "Not authorized" };
    }

    const { error } = await supabaseAdmin
      .from("lessons")
      .update({ requires_submission: data.value })
      .eq("id", data.lessonId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const setCourseLessonsRequireSubmission = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { courseId: string; value: boolean; accessToken?: string }) => d,
  )
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    if (!(await assertCanEditMandatory(ctx.userId))) {
      return { ok: false as const, error: "Not authorized" };
    }

    const { data: sections, error: secErr } = await supabaseAdmin
      .from("sections")
      .select("id")
      .eq("course_id", data.courseId);
    if (secErr) return { ok: false as const, error: secErr.message };
    const sectionIds = (sections ?? []).map((s) => s.id);
    if (sectionIds.length === 0) return { ok: true as const, updated: 0 };

    const { error, count } = await supabaseAdmin
      .from("lessons")
      .update({ requires_submission: data.value }, { count: "exact" })
      .in("section_id", sectionIds);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, updated: count ?? 0 };
  });

// Used by the read side so Maida (Incharge) can also see draft courses in the
// course-rules page. Uses service role so RLS's "published-only" filter on
// lessons for non-CEO roles doesn't hide drafts from her.
export const listCoursesForMandatoryEditor = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    if (!(await assertCanEditMandatory(ctx.userId))) {
      return { ok: false as const, error: "Not authorized" };
    }

    const [{ data: courses, error: cErr }, { data: sections, error: sErr }, { data: lessons, error: lErr }] = await Promise.all([
      supabaseAdmin
        .from("courses")
        .select("id, title, status")
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("sections")
        .select("id, course_id, title, position")
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("lessons")
        .select("id, section_id, title, type, position, duration_seconds, requires_submission")
        .order("position", { ascending: true }),
    ]);
    if (cErr) return { ok: false as const, error: cErr.message };
    if (sErr) return { ok: false as const, error: sErr.message };
    if (lErr) return { ok: false as const, error: lErr.message };

    return {
      ok: true as const,
      courses: courses ?? [],
      sections: sections ?? [],
      lessons: lessons ?? [],
    };
  });
