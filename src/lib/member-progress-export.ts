import * as XLSX from "xlsx";
import type { RosterRow } from "@/lib/member-progress";
import { statusLabel } from "@/lib/member-progress";
import { supabase } from "@/integrations/supabase/client";

/**
 * Build a two-sheet workbook:
 *   Sheet 1 — Summary (one row per member)
 *   Sheet 2 — Hours by Course (members × courses, hours this week)
 */
export async function buildAndDownloadRosterReport(rows: RosterRow[]): Promise<void> {
  const wb = XLSX.utils.book_new();

  const summaryRows = rows.map((r) => ({
    Name: r.fullName,
    Franchise: r.franchiseName ?? "",
    "Completion %": r.completionPct,
    "Hours (last 7d)": r.hoursThisWeek,
    "Attendance % (14d)": r.attendancePct14d,
    "Avg Grade": r.avgGrade ?? "",
    "Pending QA": r.pendingQa,
    "Pace Δ (pp)": r.paceDelta ?? "",
    Status: statusLabel(r.status),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");

  // Hours by Course — query study_sessions for the last 7 days, group per user × course
  const userIds = rows.map((r) => r.userId);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  let coursesMap = new Map<string, string>();
  const cellsByUser = new Map<string, Map<string, number>>(); // userId → courseId → seconds
  if (userIds.length > 0) {
    const [{ data: sessions }, { data: courses }] = await Promise.all([
      supabase
        .from("study_sessions")
        .select("user_id, course_id, active_seconds")
        .in("user_id", userIds)
        .gte("started_at", since),
      supabase.from("courses").select("id, title"),
    ]);
    coursesMap = new Map((courses ?? []).map((c) => [c.id, c.title]));
    for (const s of sessions ?? []) {
      if (!s.course_id) continue;
      const inner = cellsByUser.get(s.user_id) ?? new Map<string, number>();
      inner.set(s.course_id, (inner.get(s.course_id) ?? 0) + (s.active_seconds ?? 0));
      cellsByUser.set(s.user_id, inner);
    }
  }

  // Build pivoted rows
  const courseColIds = Array.from(
    new Set(
      Array.from(cellsByUser.values()).flatMap((m) => Array.from(m.keys())),
    ),
  );
  const courseHeaders = courseColIds.map((id) => coursesMap.get(id) ?? "Untitled");

  const pivot: (string | number)[][] = [
    ["Member", "Franchise", ...courseHeaders, "Total (h)"],
  ];
  for (const r of rows) {
    const inner = cellsByUser.get(r.userId);
    const cells = courseColIds.map((cid) => {
      const sec = inner?.get(cid) ?? 0;
      return sec > 0 ? Math.round((sec / 3600) * 10) / 10 : 0;
    });
    const total = cells.reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
    pivot.push([r.fullName, r.franchiseName ?? "", ...cells, Math.round(total * 10) / 10]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivot), "Hours by Course");

  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `member-progress-${date}.xlsx`);
}
