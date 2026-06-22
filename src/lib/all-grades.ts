// Unified grade-row fetcher: pulls BOTH lesson submissions and project
// submissions, normalizes them into the shared GradedRow shape, and returns
// them combined. Every CEO dashboard aggregator must use this — reading only
// the `submissions` table silently drops every graded project.

import { supabase } from "@/integrations/supabase/client";
import type { GradedRow } from "@/lib/grade-utils";

const LESSON_COLS =
  "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by";
const PROJECT_COLS =
  "id,user_id,project_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by";

function normalizeLesson(rows: any[] | null): GradedRow[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    lesson_id: r.lesson_id,
    project_id: null,
    source: "lesson" as const,
    status: r.status,
    letter_grade: r.letter_grade,
    grade: r.grade,
    feedback: r.feedback,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    reviewed_by: r.reviewed_by,
  }));
}

function normalizeProject(rows: any[] | null): GradedRow[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    lesson_id: null,
    project_id: r.project_id,
    source: "project" as const,
    status: r.status,
    letter_grade: r.letter_grade,
    grade: r.grade,
    feedback: r.feedback,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    reviewed_by: r.reviewed_by,
  }));
}

/** Combined lesson + project submissions for a set of users. */
export async function fetchAllGradedRows(
  userIds: string[],
): Promise<GradedRow[]> {
  if (userIds.length === 0) return [];
  const [lessonRes, projectRes] = await Promise.all([
    supabase.from("submissions").select(LESSON_COLS).in("user_id", userIds),
    supabase
      .from("project_submissions")
      .select(PROJECT_COLS)
      .in("user_id", userIds),
  ]);
  return [
    ...normalizeLesson(lessonRes.data),
    ...normalizeProject(projectRes.data),
  ];
}

/** Combined lesson + project submissions for a single user. */
export async function fetchAllGradedRowsForUser(
  userId: string,
): Promise<GradedRow[]> {
  const [lessonRes, projectRes] = await Promise.all([
    supabase.from("submissions").select(LESSON_COLS).eq("user_id", userId),
    supabase
      .from("project_submissions")
      .select(PROJECT_COLS)
      .eq("user_id", userId),
  ]);
  return [
    ...normalizeLesson(lessonRes.data),
    ...normalizeProject(projectRes.data),
  ];
}

/**
 * Combined lesson + project submissions across every user the caller can see
 * (RLS-scoped). Used by CEO views that previously did `.from("submissions")`
 * with no user filter.
 */
export async function fetchAllGradedRowsVisible(): Promise<GradedRow[]> {
  const [lessonRes, projectRes] = await Promise.all([
    supabase
      .from("submissions")
      .select(LESSON_COLS)
      .order("reviewed_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("project_submissions")
      .select(PROJECT_COLS)
      .order("reviewed_at", { ascending: false, nullsFirst: false }),
  ]);
  return [
    ...normalizeLesson(lessonRes.data),
    ...normalizeProject(projectRes.data),
  ];
}
