// Shared types for day-end reports. The DayReportPayload shape lives in
// day_reports.payload (jsonb) and is the single source of truth that the
// DayReportCard renders from.

export type LateSeverity = "on_time" | "late" | "very_late";
export type DayStatus = "on_track" | "slipping" | "at_risk";

export interface DayReportLessonCompleted {
  id: string;
  title: string;
}

export interface DayReportSubmission {
  id: string;
  title: string;
  kind: "lesson" | "project";
  status: "pending" | "approved" | "revision";
  grade: number | null;
  letterGrade: string | null;
}

export interface DayReportCourse {
  courseId: string;
  title: string;
  completionPct: number;
  done: number;
  total: number;
  hoursToday: number;
}

export interface DayReportPayload {
  // Identity
  userId: string;
  fullName: string;
  franchiseName: string | null;

  // Date in PKT (YYYY-MM-DD)
  reportDate: string;

  // Time & pace
  hoursToday: number;          // 1-decimal hours
  hoursThisWeek: number;       // 1-decimal hours
  targetHoursWeek: number;     // expected * weekdays elapsed
  startedAtPkt: string | null; // "HH:MM AM/PM"
  workStartTimePkt: string;    // member's scheduled start, "HH:MM AM/PM"
  lateMinutes: number;         // 0 if on-time
  lateSeverity: LateSeverity;
  status: DayStatus;

  // Today's work
  lessonsCompleted: DayReportLessonCompleted[];
  submissions: DayReportSubmission[];

  // Course progress for courses touched today
  coursesWorkedOn: DayReportCourse[];

  // AI narrative
  aiSummary: string | null;
}
