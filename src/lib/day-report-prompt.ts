// Builds the Gemini prompt for the AI summary paragraph. Pure helper —
// no IO, no env access — so it's trivial to unit-test if we ever want to.

import type { DayReportPayload } from "@/lib/day-report-types";

export const DAY_REPORT_SYSTEM_PROMPT = `You are writing the AI summary paragraph at the bottom of an end-of-day training report card at IRM Academy. The card already shows hard numbers (hours, lessons, submissions, lateness, course progress) — your job is to turn that into a factual, manager-readable narrative in third person.

Rules:
- Write 2 to 4 sentences. No more.
- Third person, using the trainee's first name.
- Factual recap only. Describe what they did today.
- Do NOT give advice. Do NOT suggest what to do tomorrow. Do NOT mention blockers.
- If they started late, mention it naturally in the same sentence as their hours.
- Mention grades by letter (or percent) when present.
- No emoji. No markdown. No bullet points. Plain prose.
- If they did very little today (under 30 minutes or no lessons), still be factual — do not pad.`;

export function buildDayReportUserPrompt(payload: DayReportPayload): string {
  const firstName = (payload.fullName.split(" ")[0] ?? payload.fullName).trim();

  const submissionLines = payload.submissions.map((s) => {
    if (s.status === "pending") return `${s.title} (pending QA)`;
    if (s.letterGrade) return `${s.title} → ${s.letterGrade}${s.grade != null ? ` (${s.grade})` : ""}`;
    if (s.grade != null) return `${s.title} → ${s.grade}`;
    return `${s.title} (${s.status})`;
  });

  const lessonLines = payload.lessonsCompleted.map((l) => l.title);

  const lateLine =
    payload.lateMinutes > 0
      ? `Started ${payload.startedAtPkt ?? "?"} PKT — ${payload.lateMinutes} minutes late (scheduled ${payload.workStartTimePkt})`
      : `Started ${payload.startedAtPkt ?? "?"} PKT — on time (scheduled ${payload.workStartTimePkt})`;

  const courseLines = payload.coursesWorkedOn.map(
    (c) =>
      `${c.title}: ${c.hoursToday.toFixed(1)}h today, now ${c.completionPct}% (${c.done}/${c.total})`,
  );

  return [
    `Trainee: ${firstName}${payload.franchiseName ? ` (${payload.franchiseName})` : ""}`,
    `Date: ${payload.reportDate}`,
    `Hours today: ${payload.hoursToday.toFixed(1)}h`,
    `Hours this week: ${payload.hoursThisWeek.toFixed(1)}h of ${payload.targetHoursWeek.toFixed(1)}h target`,
    lateLine,
    `Status: ${payload.status.replace("_", " ")}`,
    lessonLines.length
      ? `Lessons completed today (${lessonLines.length}):\n- ${lessonLines.join("\n- ")}`
      : "Lessons completed today: none",
    submissionLines.length
      ? `Submissions today (${submissionLines.length}):\n- ${submissionLines.join("\n- ")}`
      : "Submissions today: none",
    courseLines.length
      ? `Courses worked on today:\n- ${courseLines.join("\n- ")}`
      : "Courses worked on today: none",
    "",
    "Write the 2-4 sentence summary now.",
  ].join("\n");
}
