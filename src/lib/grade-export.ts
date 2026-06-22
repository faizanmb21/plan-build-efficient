import * as XLSX from "xlsx";
import { aggregateGrades, type GradedRow, type GradeAggregate } from "@/lib/grade-utils";

export interface ExportProfile {
  id: string;
  full_name: string | null;
  franchise_id: string | null;
}
export interface ExportFranchise {
  id: string;
  name: string;
}
export interface ExportLessonShape {
  id: string;
  title?: string;
  sections: { course_id: string; courses: { id: string; title: string } | null } | null;
}
export interface BuildOptions {
  profiles: ExportProfile[];
  franchises: ExportFranchise[];
  memberRoleIds: Set<string>;
  inchargeRoleIds: Set<string>;
  submissions: GradedRow[];
  lessonMap: Map<string, ExportLessonShape>;
  reviewerNames: Map<string, string | null>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

export function buildGradesWorkbook(opts: BuildOptions): XLSX.WorkBook {
  const { profiles, franchises, memberRoleIds, inchargeRoleIds, submissions, lessonMap, reviewerNames } = opts;
  const franchiseName = new Map(franchises.map((f) => [f.id, f.name]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // Group submissions by user
  const byUser = new Map<string, GradedRow[]>();
  submissions.forEach((s) => {
    const arr = byUser.get(s.user_id) ?? [];
    arr.push(s);
    byUser.set(s.user_id, arr);
  });

  const aggOf = (userId: string): GradeAggregate => aggregateGrades(byUser.get(userId) ?? []);

  // ---- Sheet 1: Summary (members + incharges) ----
  const summaryRows: Record<string, string | number>[] = [];
  for (const p of profiles) {
    const isMember = memberRoleIds.has(p.id);
    const isIncharge = inchargeRoleIds.has(p.id);
    if (!isMember && !isIncharge) continue;
    const a = aggOf(p.id);
    summaryRows.push({
      Name: p.full_name ?? "",
      Role: isIncharge ? "Incharge" : "Member",
      Franchise: p.franchise_id ? (franchiseName.get(p.franchise_id) ?? "") : "",
      "Total Graded": a.total,
      "Avg %": a.averagePercent,
      "Pass %": a.passRate,
      "A+": a.aPlus,
      A: a.a,
      B: a.b,
      "C / Redo": a.c,
      Pending: a.pending,
      "Last Graded": fmtDate(a.lastGradedAt),
    });
  }
  summaryRows.sort((a, b) => Number(b["Avg %"]) - Number(a["Avg %"]));

  // ---- Sheet 2: Members - Detail (per submission) ----
  const detailRows: Record<string, string | number>[] = [];
  for (const s of submissions) {
    const p = profileById.get(s.user_id);
    if (!p || !memberRoleIds.has(s.user_id)) continue;
    const lesson = s.lesson_id ? lessonMap.get(s.lesson_id) : undefined;
    const courseTitle = lesson?.sections?.courses?.title ?? "";
    const lessonTitle = lesson?.title ?? "";
    detailRows.push({
      Member: p.full_name ?? "",
      Franchise: p.franchise_id ? (franchiseName.get(p.franchise_id) ?? "") : "",
      Course: courseTitle,
      Lesson: lessonTitle,
      Letter: s.letter_grade ?? "",
      "Percent %": s.grade ?? "",
      Status: s.status,
      Reviewer: s.reviewed_by ? (reviewerNames.get(s.reviewed_by) ?? "") : "",
      Submitted: fmtDate(s.created_at),
      Graded: fmtDate(s.reviewed_at),
      Feedback: s.feedback ?? "",
    });
  }

  // ---- Sheet 3: By Course pivot ----
  // rows = members, columns = course titles, cells = avg % for that member in that course
  const courseTitles = new Set<string>();
  const memberCoursePct = new Map<string, Map<string, number[]>>(); // userId -> course -> [percents]
  for (const s of submissions) {
    if (!memberRoleIds.has(s.user_id)) continue;
    const lesson = s.lesson_id ? lessonMap.get(s.lesson_id) : undefined;
    const ct = lesson?.sections?.courses?.title;
    if (!ct) continue;
    if (s.letter_grade == null) continue;
    courseTitles.add(ct);
    const pct =
      s.letter_grade === "A+" ? 90 : s.letter_grade === "A" ? 85 : s.letter_grade === "B" ? 75 : 0;
    const inner = memberCoursePct.get(s.user_id) ?? new Map();
    const list = inner.get(ct) ?? [];
    list.push(pct);
    inner.set(ct, list);
    memberCoursePct.set(s.user_id, inner);
  }
  const sortedCourses = Array.from(courseTitles).sort();
  const pivotRows: Record<string, string | number>[] = [];
  for (const p of profiles) {
    if (!memberRoleIds.has(p.id)) continue;
    const inner = memberCoursePct.get(p.id);
    const row: Record<string, string | number> = {
      Member: p.full_name ?? "",
      Franchise: p.franchise_id ? (franchiseName.get(p.franchise_id) ?? "") : "",
    };
    let allSum = 0;
    let allCount = 0;
    for (const ct of sortedCourses) {
      const list = inner?.get(ct);
      if (list && list.length > 0) {
        const avg = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
        row[ct] = avg;
        allSum += avg;
        allCount++;
      } else {
        row[ct] = "";
      }
    }
    row["Overall %"] = allCount > 0 ? Math.round(allSum / allCount) : "";
    pivotRows.push(row);
  }
  pivotRows.sort((a, b) => Number(b["Overall %"] || 0) - Number(a["Overall %"] || 0));

  // ---- Sheet 4: Incharges ----
  const inchargeRows: Record<string, string | number>[] = [];
  for (const p of profiles) {
    if (!inchargeRoleIds.has(p.id)) continue;
    const fname = p.franchise_id ? (franchiseName.get(p.franchise_id) ?? "") : "";
    const memberIds = profiles
      .filter((m) => memberRoleIds.has(m.id) && m.franchise_id && m.franchise_id === p.franchise_id)
      .map((m) => m.id);
    const subs = memberIds.flatMap((id) => byUser.get(id) ?? []);
    const a = aggregateGrades(subs);
    inchargeRows.push({
      Incharge: p.full_name ?? "",
      Franchise: fname,
      Members: memberIds.length,
      "Franchise Graded": a.total,
      "Franchise Avg %": a.averagePercent,
      "Pass %": a.passRate,
      "Redo %": a.redoRate,
      "A+": a.aPlus,
      A: a.a,
      B: a.b,
      "C / Redo": a.c,
    });
  }
  inchargeRows.sort((a, b) => Number(b["Franchise Avg %"]) - Number(a["Franchise Avg %"]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Members - Detail");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pivotRows), "By Course");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inchargeRows), "Incharges");
  return wb;
}

export function downloadGradesWorkbook(wb: XLSX.WorkBook): void {
  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `grades-report-${date}.xlsx`);
}
