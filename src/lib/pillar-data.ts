// Aggregates lesson_progress + sections + lessons + courses into per-pillar
// mastery scores aligned with PILLARS (12 entries, order matches title list).

import { supabase } from "@/integrations/supabase/client";
import { PILLARS, type PillarScores } from "./pillars";

interface Course {
  id: string;
  title: string;
}

interface LessonRow {
  id: string;
  section_id: string;
  sections: { course_id: string } | null;
}

/**
 * Compute pillar mastery scores (0..1, length 12) for a set of users.
 * - Looks up the 12 courses by title (matching PILLARS order).
 * - For each user × course, score = completed_lessons / total_lessons.
 * - Returned score per pillar = average across users (so 1 user with 100%
 *   yields 1.0; 2 users with 100% + 0% yields 0.5).
 *
 * If userIds is empty, all scores are 0.
 */
export async function getPillarScoresForUsers(userIds: string[]): Promise<PillarScores> {
  const empty: PillarScores = PILLARS.map(() => 0);
  if (userIds.length === 0) return empty;

  // 1. Resolve the 12 pillar courses
  const titles = PILLARS.map((p) => p.title);
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .in("title", titles);

  const courseList = (courses as Course[] | null) ?? [];
  const courseIdByPillar = PILLARS.map((p) => courseList.find((c) => c.title === p.title)?.id);

  // 2. Get all lessons for those courses, grouped by course
  const courseIds = courseIdByPillar.filter((x): x is string => Boolean(x));
  if (courseIds.length === 0) return empty;

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, section_id, sections!inner(course_id)")
    .in("sections.course_id", courseIds);

  const lessonsByCourse = new Map<string, string[]>();
  ((lessons as unknown as LessonRow[] | null) ?? []).forEach((l) => {
    const cid = l.sections?.course_id;
    if (!cid) return;
    const arr = lessonsByCourse.get(cid) ?? [];
    arr.push(l.id);
    lessonsByCourse.set(cid, arr);
  });

  const allLessonIds = Array.from(lessonsByCourse.values()).flat();
  if (allLessonIds.length === 0) return empty;

  // 3. Get completed lesson_progress for these users + lessons
  const { data: progress } = await supabase
    .from("lesson_progress")
    .select("user_id, lesson_id, completed")
    .in("user_id", userIds)
    .in("lesson_id", allLessonIds)
    .eq("completed", true);

  // user_id → set of completed lesson_ids
  const completedByUser = new Map<string, Set<string>>();
  (progress ?? []).forEach((p) => {
    if (!p.completed) return;
    const set = completedByUser.get(p.user_id) ?? new Set<string>();
    set.add(p.lesson_id);
    completedByUser.set(p.user_id, set);
  });

  // 4. Compute per-pillar score = average across users of (done/total) for that pillar's course
  return PILLARS.map((_, idx) => {
    const cid = courseIdByPillar[idx];
    if (!cid) return 0;
    const lessonIds = lessonsByCourse.get(cid) ?? [];
    if (lessonIds.length === 0) return 0;
    let sum = 0;
    let n = 0;
    userIds.forEach((uid) => {
      const done = completedByUser.get(uid) ?? new Set<string>();
      const completed = lessonIds.filter((lid) => done.has(lid)).length;
      sum += completed / lessonIds.length;
      n += 1;
    });
    return n === 0 ? 0 : sum / n;
  });
}
