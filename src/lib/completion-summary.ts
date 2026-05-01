// Course-completion aggregation. Computes per-user-per-course completion %
// from `lesson_progress`, plus rollups by course and by user.

import { supabase } from "@/integrations/supabase/client";

export interface UserCourseCompletion {
  courseId: string;
  done: number;
  total: number;
  pct: number;
}

export interface UserCompletionSummary {
  byCourse: Map<string, UserCourseCompletion>;
  overallPct: number; // mean of pct across courses (only courses with total>0)
  totalLessons: number;
  doneLessons: number;
}

export interface CourseCompletionRollup {
  courseId: string;
  title: string;
  enrolled: number; // distinct members with this course assigned
  completed: number; // members who reached 100%
  avgPct: number; // mean completion across enrolled
}

interface FetchInput {
  userIds: string[];
  /** Optional restrict-to courses. If empty, uses every course referenced by their assignments. */
  courseIds?: string[];
}

interface CompletionResult {
  byUser: Map<string, UserCompletionSummary>;
  byCourse: Map<string, CourseCompletionRollup>;
  /** Mean of every member's overallPct (members in `userIds`). */
  overallAvgPct: number;
  /** Course titles by id for convenience. */
  courseTitles: Map<string, string>;
}

const empty = (): CompletionResult => ({
  byUser: new Map(),
  byCourse: new Map(),
  overallAvgPct: 0,
  courseTitles: new Map(),
});

export async function fetchCompletionSummary({
  userIds,
  courseIds,
}: FetchInput): Promise<CompletionResult> {
  if (userIds.length === 0) return empty();

  // Pull every assignment for these users (defines "enrolled")
  const { data: assignments } = await supabase
    .from("assignments")
    .select("user_id,course_id,deadline")
    .in("user_id", userIds);

  const assignmentByUserCourse = new Map<string, { deadline: string | null }>();
  const enrolledCourseSet = new Set<string>();
  const enrolledByCourse = new Map<string, Set<string>>();
  for (const a of assignments ?? []) {
    enrolledCourseSet.add(a.course_id);
    const key = `${a.user_id}|${a.course_id}`;
    assignmentByUserCourse.set(key, { deadline: a.deadline ?? null });
    const set = enrolledByCourse.get(a.course_id) ?? new Set<string>();
    set.add(a.user_id);
    enrolledByCourse.set(a.course_id, set);
  }

  const restrict = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
  const targetCourses = restrict
    ? Array.from(enrolledCourseSet).filter((c) => restrict.has(c))
    : Array.from(enrolledCourseSet);

  if (targetCourses.length === 0) {
    const out = empty();
    for (const uid of userIds) {
      out.byUser.set(uid, {
        byCourse: new Map(),
        overallPct: 0,
        totalLessons: 0,
        doneLessons: 0,
      });
    }
    return out;
  }

  // Get courses, sections, lessons
  const { data: coursesRows } = await supabase
    .from("courses")
    .select("id,title")
    .in("id", targetCourses);
  const courseTitles = new Map<string, string>();
  for (const c of coursesRows ?? []) courseTitles.set(c.id, c.title);

  const { data: secs } = await supabase
    .from("sections")
    .select("id,course_id")
    .in("course_id", targetCourses);
  const sectionToCourse = new Map<string, string>();
  for (const s of secs ?? []) sectionToCourse.set(s.id, s.course_id);
  const sectionIds = Array.from(sectionToCourse.keys());

  const { data: lessons } = sectionIds.length
    ? await supabase.from("lessons").select("id,section_id").in("section_id", sectionIds)
    : { data: [] as { id: string; section_id: string }[] };

  const lessonToCourse = new Map<string, string>();
  const totalsByCourse = new Map<string, number>();
  for (const l of lessons ?? []) {
    const cid = sectionToCourse.get(l.section_id);
    if (!cid) continue;
    lessonToCourse.set(l.id, cid);
    totalsByCourse.set(cid, (totalsByCourse.get(cid) ?? 0) + 1);
  }

  const lessonIds = Array.from(lessonToCourse.keys());
  const { data: progress } = lessonIds.length
    ? await supabase
        .from("lesson_progress")
        .select("user_id,lesson_id,completed")
        .in("user_id", userIds)
        .in("lesson_id", lessonIds)
    : { data: [] as { user_id: string; lesson_id: string; completed: boolean }[] };

  // Tally done per user per course
  const doneByUserCourse = new Map<string, Map<string, number>>();
  for (const p of progress ?? []) {
    if (!p.completed) continue;
    const cid = lessonToCourse.get(p.lesson_id);
    if (!cid) continue;
    const inner = doneByUserCourse.get(p.user_id) ?? new Map<string, number>();
    inner.set(cid, (inner.get(cid) ?? 0) + 1);
    doneByUserCourse.set(p.user_id, inner);
  }

  const byUser = new Map<string, UserCompletionSummary>();
  for (const uid of userIds) {
    const myCourses: UserCourseCompletion[] = [];
    let pctSum = 0;
    let pctCount = 0;
    let totalAll = 0;
    let doneAll = 0;
    for (const cid of targetCourses) {
      // Only count courses this user is actually assigned to (enrolled)
      if (!enrolledByCourse.get(cid)?.has(uid)) continue;
      const total = totalsByCourse.get(cid) ?? 0;
      const done = doneByUserCourse.get(uid)?.get(cid) ?? 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      myCourses.push({ courseId: cid, done, total, pct });
      totalAll += total;
      doneAll += done;
      if (total > 0) {
        pctSum += pct;
        pctCount++;
      }
    }
    const map = new Map<string, UserCourseCompletion>();
    for (const c of myCourses) map.set(c.courseId, c);
    byUser.set(uid, {
      byCourse: map,
      overallPct: pctCount > 0 ? Math.round(pctSum / pctCount) : 0,
      totalLessons: totalAll,
      doneLessons: doneAll,
    });
  }

  // Per-course rollup
  const byCourse = new Map<string, CourseCompletionRollup>();
  for (const cid of targetCourses) {
    const enrolled = enrolledByCourse.get(cid)?.size ?? 0;
    let completed = 0;
    let pctSum = 0;
    let pctCount = 0;
    for (const uid of enrolledByCourse.get(cid) ?? []) {
      if (!userIds.includes(uid)) continue; // only members in scope
      const rec = byUser.get(uid)?.byCourse.get(cid);
      if (!rec) continue;
      pctSum += rec.pct;
      pctCount++;
      if (rec.pct >= 100) completed++;
    }
    byCourse.set(cid, {
      courseId: cid,
      title: courseTitles.get(cid) ?? "Untitled course",
      enrolled,
      completed,
      avgPct: pctCount > 0 ? Math.round(pctSum / pctCount) : 0,
    });
  }

  // Overall avg = mean of every user's overallPct (excluding users with no enrolled course)
  let userPctSum = 0;
  let userPctCount = 0;
  for (const uid of userIds) {
    const u = byUser.get(uid);
    if (!u || u.byCourse.size === 0) continue;
    userPctSum += u.overallPct;
    userPctCount++;
  }
  const overallAvgPct = userPctCount > 0 ? Math.round(userPctSum / userPctCount) : 0;

  return { byUser, byCourse, overallAvgPct, courseTitles };
}

export interface OverdueInfo {
  userId: string;
  count: number;
}

/**
 * Count overdue assignments per user (deadline < now AND completion < 100%).
 */
export async function fetchOverdueCounts(
  userIds: string[],
  byUser: Map<string, UserCompletionSummary>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const uid of userIds) out.set(uid, 0);
  if (userIds.length === 0) return out;

  const { data: assignments } = await supabase
    .from("assignments")
    .select("user_id,course_id,deadline")
    .in("user_id", userIds)
    .not("deadline", "is", null);

  const now = Date.now();
  for (const a of assignments ?? []) {
    if (!a.deadline) continue;
    if (new Date(a.deadline).getTime() >= now) continue;
    const pct = byUser.get(a.user_id)?.byCourse.get(a.course_id)?.pct ?? 0;
    if (pct >= 100) continue;
    out.set(a.user_id, (out.get(a.user_id) ?? 0) + 1);
  }
  return out;
}
