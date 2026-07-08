// PDF documents for the monthly attendance/performance report.
// Import this module ONLY via dynamic import() in the app — @react-pdf/renderer
// is heavy and must stay out of the main bundle. Imports here are RELATIVE
// (no @/ aliases) so scripts/preview-report-pdf.tsx can render these docs in
// plain Node too.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  Circle,
  G,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import {
  monthLabel,
  monthlyScore,
  weeklyBreakdown,
  formatPktClockTime,
  type MemberMonthReport,
  type ReportDay,
} from "../../lib/attendance-report-shared";

// ---------- palette ----------

const INK = "#1a1a22";
const MUTED = "#6b7280";
const HAIR = "#e5e7eb";
const BRAND = "#4f46e5";
const GREEN = "#047857";
const GREEN_BG = "#d1fae5";
const AMBER = "#b45309";
const AMBER_BG = "#fef3c7";
const ROSE = "#be123c";
const ROSE_BG = "#ffe4e6";
const OFF_BG = "#f3f4f6";
const TRACK = "#eef0f3";
const ACCENT = "#4f46e5";
const ACCENT_DIM = "#b7b3f0";

function pctColor(pct: number) {
  return pct >= 90 ? GREEN : pct >= 75 ? AMBER : ROSE;
}
function pctBg(pct: number) {
  return pct >= 90 ? GREEN_BG : pct >= 75 ? AMBER_BG : ROSE_BG;
}
function hoursStr(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const s = StyleSheet.create({
  page: { padding: 26, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 9,
    marginBottom: 12,
  },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: MUTED, marginTop: 2 },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND },
  row: { flexDirection: "row" },
  section: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: MUTED,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  td: { paddingVertical: 5, paddingHorizontal: 4, fontSize: 8.5 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: HAIR },
  pctPill: {
    borderRadius: 8,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    alignSelf: "flex-end",
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 26,
    right: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: 6,
  },
});

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>{subtitle}</Text>
      </View>
      <Text style={s.brand}>IRM ACADEMY</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>IRM Academy — training report</Text>
      <Text
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function PctPill({ pct }: { pct: number }) {
  return (
    <Text style={[s.pctPill, { color: pctColor(pct), backgroundColor: pctBg(pct) }]}>
      {pct}%
    </Text>
  );
}

// ---------- Hero score ring ----------

function ScoreRing({ score, letter }: { score: number; letter: string }) {
  const R = 50;
  const C = 2 * Math.PI * R; // ≈ 314.16
  const dash = Math.max(0.01, (Math.min(100, score) / 100) * C);
  const color = pctColor(score);
  return (
    <View style={{ width: 118, alignItems: "center" }}>
      <View style={{ width: 112, height: 112, position: "relative" }}>
        <Svg width={112} height={112} viewBox="0 0 120 120">
          <Circle cx={60} cy={60} r={R} fill="none" stroke={TRACK} strokeWidth={11} />
          <G transform="rotate(-90 60 60)">
            <Circle
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={11}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
            />
          </G>
        </Svg>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 112,
            height: 112,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold" }}>{score}</Text>
          <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 1 }}>MONTHLY SCORE</Text>
        </View>
      </View>
      <Text
        style={{
          marginTop: 4,
          fontSize: 9,
          fontFamily: "Helvetica-Bold",
          color,
          backgroundColor: pctBg(score),
          borderRadius: 8,
          paddingVertical: 2,
          paddingHorizontal: 10,
        }}
      >
        Grade {letter}
      </Text>
    </View>
  );
}

// ---------- Metric bar ----------

function MetricBar({
  label,
  detail,
  pct,
}: {
  label: string;
  detail: string;
  pct: number | null;
}) {
  const v = pct ?? 0;
  const color = pct != null ? pctColor(v) : MUTED;
  return (
    <View style={{ marginBottom: 7 }}>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
        <Text style={{ fontSize: 8.5 }}>
          {label} <Text style={{ color: MUTED, fontSize: 7.5 }}>· {detail}</Text>
        </Text>
        <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color }}>
          {pct != null ? `${pct}%` : "—"}
        </Text>
      </View>
      <View style={{ height: 5, backgroundColor: TRACK, borderRadius: 3 }}>
        {pct != null && (
          <View
            style={{
              height: 5,
              width: `${Math.min(100, v)}%`,
              backgroundColor: color,
              borderRadius: 3,
            }}
          />
        )}
      </View>
    </View>
  );
}

// ---------- Weekly hours chart ----------

const CHART_H = 62;

function WeeklyChart({ member }: { member: MemberMonthReport }) {
  const weeks = weeklyBreakdown(member);
  if (weeks.length === 0) return null;
  // Dashed reference = a FULL working week's target (5 × daily hours). It's a
  // fixed, meaningful line the bars are read against — not derived from the
  // bars themselves.
  const weeklyTargetSec = 5 * member.expectedDailyHours * 3600;
  const maxActive = Math.max(...weeks.map((w) => w.activeSec), 0);
  // Headroom so the tallest bar and the target line both sit comfortably.
  const maxSec = Math.max(maxActive, weeklyTargetSec) * 1.18 || 1;
  const targetY = (weeklyTargetSec / maxSec) * CHART_H;
  const targetHrs = Math.round(weeklyTargetSec / 3600);

  return (
    <View style={{ flex: 1.25, paddingRight: 16 }}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
        <Text style={s.section}>HOURS BY WEEK</Text>
        <Text style={{ fontSize: 6.5, color: MUTED }}>Target {targetHrs}h/wk</Text>
      </View>
      <View style={{ height: CHART_H, position: "relative", flexDirection: "row", alignItems: "flex-end" }}>
        {/* target reference line */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: targetY,
            borderTopWidth: 1,
            borderTopColor: "#9ca3af",
            borderTopStyle: "dashed",
          }}
        />
        {weeks.map((w) => {
          const h = Math.max(2, (w.activeSec / maxSec) * CHART_H);
          // On track if they met the target for the days elapsed in that week.
          const hit = w.targetSec === 0 || w.activeSec >= w.targetSec;
          return (
            <View
              key={w.label}
              style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}
            >
              <Text style={{ fontSize: 6.5, color: MUTED, marginBottom: 1.5 }}>
                {(w.activeSec / 3600).toFixed(1)}h
              </Text>
              <View
                style={{
                  width: 26,
                  height: h,
                  backgroundColor: hit ? ACCENT : ACCENT_DIM,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={[s.row, { marginTop: 3, borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 2 }]}>
        {weeks.map((w) => (
          <Text key={w.label} style={{ flex: 1, textAlign: "center", fontSize: 7, color: MUTED }}>
            {w.label}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 3 }}>
        Dashed line = full week target · faded bar = below pace
      </Text>
    </View>
  );
}

// ---------- Grade mix ----------

function GradeMix({ member }: { member: MemberMonthReport }) {
  const total = member.gradedCount;
  const segs = [
    { label: "A+", n: member.gradeAPlus, color: GREEN },
    { label: "A", n: member.gradeA, color: "#34d399" },
    { label: "B", n: member.gradeB, color: "#f59e0b" },
    { label: "C", n: member.gradeC, color: "#ef4444" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.section}>
        GRADE MIX {total > 0 ? `(${total} GRADED)` : ""}
      </Text>
      {total === 0 ? (
        <Text style={{ fontSize: 8, color: MUTED }}>
          No graded work this month.
          {member.gradePending > 0 ? ` ${member.gradePending} pending QA.` : ""}
        </Text>
      ) : (
        <>
          <View style={[s.row, { height: 14, borderRadius: 3, overflow: "hidden", marginBottom: 6 }]}>
            {segs
              .filter((x) => x.n > 0)
              .map((x) => (
                <View
                  key={x.label}
                  style={{ width: `${(x.n / total) * 100}%`, backgroundColor: x.color }}
                />
              ))}
          </View>
          <View style={[s.row, { flexWrap: "wrap" }]}>
            {segs.map((x) => (
              <View key={x.label} style={[s.row, { alignItems: "center", width: "50%", marginBottom: 2 }]}>
                <View
                  style={{ width: 6, height: 6, backgroundColor: x.color, borderRadius: 1.5, marginRight: 4 }}
                />
                <Text style={{ fontSize: 7.5, color: MUTED }}>
                  {x.label} · {x.n}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 3 }}>
            {member.gradePending} pending QA · {member.gradePassRate}% pass rate
          </Text>
        </>
      )}
    </View>
  );
}

// ---------- Calendar ----------

function dayCellColors(d: ReportDay): { bg: string; fg: string } {
  switch (d.status) {
    case "present":
      return { bg: GREEN_BG, fg: GREEN };
    case "late":
      return { bg: AMBER_BG, fg: AMBER };
    case "very_late":
      return { bg: ROSE_BG, fg: ROSE };
    case "absent":
      return { bg: "#fff1f2", fg: "#fb7185" };
    default:
      return { bg: OFF_BG, fg: "#9ca3af" };
  }
}

function statusLabel(d: ReportDay): string {
  switch (d.status) {
    case "present":
      return "On time";
    case "late":
      return `Late ${d.lateMinutes}m`;
    case "very_late":
      return `Very late ${d.lateMinutes}m`;
    case "absent":
      return "Absent";
    case "off":
      return "Off";
    default:
      return "";
  }
}

function Calendar({ member }: { member: MemberMonthReport }) {
  const firstDowIdx = member.days[0]
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(member.days[0].dow)
    : 0;
  const padding = Math.max(0, firstDowIdx);
  const CELL_W = `${100 / 7}%`;
  return (
    <View>
      <Text style={s.section}>ATTENDANCE CALENDAR</Text>
      <View style={s.row}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <Text
            key={d}
            style={{ width: CELL_W, fontSize: 6.5, color: MUTED, textAlign: "center", marginBottom: 2 }}
          >
            {d}
          </Text>
        ))}
      </View>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {Array.from({ length: padding }).map((_, i) => (
          <View key={`pad-${i}`} style={{ width: CELL_W, height: 25 }} />
        ))}
        {member.days.map((d) => {
          const c = dayCellColors(d);
          return (
            <View key={d.date} style={{ width: CELL_W, padding: 1.2 }}>
              <View
                style={{
                  backgroundColor: c.bg,
                  borderRadius: 3,
                  height: 23,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: c.fg }}>
                  {parseInt(d.date.slice(8), 10)}
                </Text>
                <Text style={{ fontSize: 5.5, color: c.fg }}>
                  {d.activeSec > 0 && d.status !== "off"
                    ? `${(d.activeSec / 3600).toFixed(1)}h`
                    : d.status === "absent"
                      ? "abs"
                      : d.status === "off"
                        ? "off"
                        : " "}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={[s.row, { gap: 10, marginTop: 5 }]}>
        {(
          [
            ["On time", GREEN_BG, GREEN],
            ["Late", AMBER_BG, AMBER],
            ["Very late", ROSE_BG, ROSE],
            ["Absent", "#fff1f2", "#fb7185"],
            ["Off / upcoming", OFF_BG, "#9ca3af"],
          ] as const
        ).map(([label, bg, fg]) => (
          <View key={label} style={[s.row, { alignItems: "center", gap: 3 }]}>
            <View
              style={{ width: 6, height: 6, backgroundColor: bg, borderWidth: 0.5, borderColor: fg, borderRadius: 1.5 }}
            />
            <Text style={{ fontSize: 6.5, color: MUTED }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------- Member report card (A4 portrait, 2 pages) ----------

export function MemberCardPdf({
  member,
  monthKey,
  scopeLabel,
}: {
  member: MemberMonthReport;
  monthKey: string;
  scopeLabel: string;
}) {
  const { score, letter } = monthlyScore(member);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header
          title={member.fullName}
          subtitle={`${scopeLabel} · Training report card · ${monthLabel(monthKey)}`}
        />

        {/* Hero: score ring + metric bars */}
        <View style={[s.row, { marginBottom: 12, alignItems: "center" }]}>
          <ScoreRing score={score} letter={letter} />
          <View style={{ flex: 1, paddingLeft: 18 }}>
            <MetricBar
              label="Attendance"
              detail={`${member.presentDays}/${member.workingDayCount} days`}
              pct={member.attendancePct}
            />
            <MetricBar
              label="Punctuality"
              detail={`${member.lateDays} late day${member.lateDays === 1 ? "" : "s"}`}
              pct={member.punctualityPct}
            />
            <MetricBar
              label="Hours"
              detail={`${hoursStr(member.activeSec)} of ${hoursStr(member.targetSec)}`}
              pct={member.hoursPct}
            />
            <MetricBar
              label="Course completion"
              detail={`${member.courses.length} course${member.courses.length === 1 ? "" : "s"}`}
              pct={member.completionPct}
            />
            <MetricBar
              label="Avg grade"
              detail={
                member.gradedCount > 0
                  ? `${member.gradedCount} graded`
                  : "nothing graded"
              }
              pct={member.gradedCount > 0 ? member.gradeAvgPct : null}
            />
          </View>
        </View>

        {/* Course completion */}
        {member.courses.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.section}>COURSE COMPLETION (CURRENT STANDING)</Text>
            {member.courses.slice(0, 5).map((c) => (
              <View key={c.courseId} style={{ marginBottom: 6 }}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{c.title}</Text>
                  <Text style={{ fontSize: 7.5, color: MUTED }}>
                    {c.done}/{c.total} lessons ·{" "}
                    <Text style={{ color: pctColor(c.pct), fontFamily: "Helvetica-Bold" }}>
                      {c.pct}%
                    </Text>
                  </Text>
                </View>
                <View style={{ height: 6, backgroundColor: TRACK, borderRadius: 3 }}>
                  <View
                    style={{
                      height: 6,
                      width: `${Math.min(100, c.pct)}%`,
                      backgroundColor: pctColor(c.pct),
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            ))}
            {member.courses.length > 5 && (
              <Text style={{ fontSize: 7, color: MUTED }}>
                + {member.courses.length - 5} more course{member.courses.length - 5 === 1 ? "" : "s"}
              </Text>
            )}
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
              {member.lessonsCompleted} lesson{member.lessonsCompleted === 1 ? "" : "s"} completed this
              month · {member.submissionsCount} submission{member.submissionsCount === 1 ? "" : "s"}
            </Text>
          </View>
        )}

        {/* Charts row */}
        <View style={[s.row, { marginBottom: 12 }]}>
          <WeeklyChart member={member} />
          <GradeMix member={member} />
        </View>

        <Calendar member={member} />
        <Footer />
      </Page>

      {/* Page 2 — day-by-day log */}
      <Page size="A4" style={s.page}>
        <Header
          title={`${member.fullName} — daily log`}
          subtitle={`${monthLabel(monthKey)} · scheduled start ${member.workStartTime.slice(0, 5)} PKT · ${member.expectedDailyHours}h/day`}
        />
        <View style={[s.tableRow, { borderBottomWidth: 1, borderBottomColor: INK }]}>
          {[
            ["Date", "16%"],
            ["Day", "10%"],
            ["Status", "20%"],
            ["First clock-in", "20%"],
            ["Hours", "17%"],
            ["Late by", "17%"],
          ].map(([label, width]) => (
            <Text key={label} style={[s.th, { width }]}>
              {label}
            </Text>
          ))}
        </View>
        {member.days
          .filter((d) => d.status !== "future")
          .map((d) => {
            const c = dayCellColors(d);
            return (
              <View key={d.date} style={s.tableRow} wrap={false}>
                <Text style={[s.td, { width: "16%" }]}>{d.date}</Text>
                <Text style={[s.td, { width: "10%" }]}>{d.dow}</Text>
                <Text style={[s.td, { width: "20%", color: c.fg, fontFamily: "Helvetica-Bold" }]}>
                  {statusLabel(d)}
                </Text>
                <Text style={[s.td, { width: "20%" }]}>
                  {d.firstStartIso ? formatPktClockTime(d.firstStartIso) : "—"}
                </Text>
                <Text style={[s.td, { width: "17%" }]}>
                  {d.activeSec > 0 ? hoursStr(d.activeSec) : "—"}
                </Text>
                <Text style={[s.td, { width: "17%" }]}>
                  {d.lateMinutes > 0 ? `${d.lateMinutes}m` : "—"}
                </Text>
              </View>
            );
          })}
        <Footer />
      </Page>
    </Document>
  );
}

// ---------- Roster PDF (A4 landscape) ----------

const COLS: { label: string; width: string; align?: "right" }[] = [
  { label: "Member", width: "14%" },
  { label: "Score", width: "9%", align: "right" },
  { label: "Present", width: "7%", align: "right" },
  { label: "Late", width: "5%", align: "right" },
  { label: "Absent", width: "6%", align: "right" },
  { label: "Attendance", width: "8.5%", align: "right" },
  { label: "Punctuality", width: "8.5%", align: "right" },
  { label: "Hours", width: "10.5%", align: "right" },
  { label: "Completion", width: "8.5%", align: "right" },
  { label: "Avg grade", width: "8.5%", align: "right" },
  { label: "Lessons", width: "7%", align: "right" },
  { label: "Subs", width: "7.5%", align: "right" },
];

export function RosterPdf({
  rows,
  monthKey,
  scopeLabel,
}: {
  rows: MemberMonthReport[];
  monthKey: string;
  scopeLabel: string;
}) {
  const scored = rows
    .map((r) => ({ r, s: monthlyScore(r) }))
    .sort((a, b) => b.s.score - a.s.score);
  const n = rows.length || 1;
  const avgScore = Math.round(scored.reduce((a, x) => a + x.s.score, 0) / n);
  const avgAtt = Math.round(rows.reduce((a, r) => a + r.attendancePct, 0) / n);
  const avgCompletion = Math.round(rows.reduce((a, r) => a + r.completionPct, 0) / n);
  const totalHours = rows.reduce((a, r) => a + r.activeSec, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header
          title="Monthly training report"
          subtitle={`${scopeLabel} · ${monthLabel(monthKey)} · ${rows.length} member${rows.length === 1 ? "" : "s"} · ranked by monthly score`}
        />

        <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
          {(
            [
              [`${avgScore}`, "Avg monthly score", pctColor(avgScore)],
              [`${avgAtt}%`, "Avg attendance", pctColor(avgAtt)],
              [`${avgCompletion}%`, "Avg course completion", pctColor(avgCompletion)],
              [hoursStr(totalHours), "Total hours", INK],
            ] as const
          ).map(([value, label, color]) => (
            <View
              key={label}
              style={{
                flex: 1,
                borderWidth: 0.5,
                borderColor: HAIR,
                borderRadius: 6,
                padding: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color }}>{value}</Text>
              <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", marginTop: 2 }}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <View style={[s.tableRow, { borderBottomWidth: 1, borderBottomColor: INK }]}>
          {COLS.map((c) => (
            <Text key={c.label} style={[s.th, { width: c.width, textAlign: c.align ?? "left" }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {scored.map(({ r, s: sc }) => (
          <View key={r.userId} style={s.tableRow} wrap={false}>
            <Text style={[s.td, { width: COLS[0].width, fontFamily: "Helvetica-Bold" }]}>
              {r.fullName}
            </Text>
            <View style={[s.td, { width: COLS[1].width }]}>
              <Text
                style={[
                  s.pctPill,
                  { color: pctColor(sc.score), backgroundColor: pctBg(sc.score) },
                ]}
              >
                {sc.score} · {sc.letter}
              </Text>
            </View>
            <Text style={[s.td, { width: COLS[2].width, textAlign: "right" }]}>
              {r.presentDays}/{r.workingDayCount}
            </Text>
            <Text
              style={[s.td, { width: COLS[3].width, textAlign: "right", color: r.lateDays ? AMBER : INK }]}
            >
              {r.lateDays}
            </Text>
            <Text
              style={[s.td, { width: COLS[4].width, textAlign: "right", color: r.absentDays ? ROSE : INK }]}
            >
              {r.absentDays}
            </Text>
            <View style={[s.td, { width: COLS[5].width }]}>
              <PctPill pct={r.attendancePct} />
            </View>
            <View style={[s.td, { width: COLS[6].width }]}>
              <PctPill pct={r.punctualityPct} />
            </View>
            <Text style={[s.td, { width: COLS[7].width, textAlign: "right" }]}>
              {hoursStr(r.activeSec)} ({r.hoursPct}%)
            </Text>
            <View style={[s.td, { width: COLS[8].width }]}>
              <PctPill pct={r.completionPct} />
            </View>
            <View style={[s.td, { width: COLS[9].width }]}>
              {r.gradedCount > 0 ? (
                <PctPill pct={r.gradeAvgPct} />
              ) : (
                <Text style={{ textAlign: "right", color: MUTED }}>—</Text>
              )}
            </View>
            <Text style={[s.td, { width: COLS[10].width, textAlign: "right" }]}>
              {r.lessonsCompleted}
            </Text>
            <Text style={[s.td, { width: COLS[11].width, textAlign: "right" }]}>
              {r.submissionsCount}
            </Text>
          </View>
        ))}

        <Footer />
      </Page>
    </Document>
  );
}

// ---------- Download helpers (browser only) ----------

async function downloadDoc(doc: React.ReactElement, filename: string) {
  const blob = await pdf(doc as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadRosterPdf(
  rows: MemberMonthReport[],
  monthKey: string,
  scopeLabel: string,
) {
  await downloadDoc(
    <RosterPdf rows={rows} monthKey={monthKey} scopeLabel={scopeLabel} />,
    `training-report-${scopeLabel.toLowerCase().replace(/\s+/g, "-")}-${monthKey}.pdf`,
  );
}

export async function downloadMemberPdf(
  member: MemberMonthReport,
  monthKey: string,
  scopeLabel: string,
) {
  await downloadDoc(
    <MemberCardPdf member={member} monthKey={monthKey} scopeLabel={scopeLabel} />,
    `report-card-${member.fullName.toLowerCase().replace(/\s+/g, "-")}-${monthKey}.pdf`,
  );
}
