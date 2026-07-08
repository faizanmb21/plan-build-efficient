// PDF documents for the monthly attendance/performance report.
// Import this module ONLY via dynamic import() — @react-pdf/renderer is heavy
// and must stay out of the main bundle.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import {
  monthLabel,
  formatPktClockTime,
  type MemberMonthReport,
  type ReportDay,
} from "@/lib/attendance-report";

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
  page: { padding: 28, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 10,
    marginBottom: 14,
  },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: MUTED, marginTop: 2 },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND },
  row: { flexDirection: "row" },
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
  tile: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: HAIR,
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
  },
  tilePct: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  tileLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 3 },
  tileSub: { fontSize: 7, color: MUTED, marginTop: 1.5 },
  section: { fontSize: 9, fontFamily: "Helvetica-Bold", color: MUTED, marginBottom: 6 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
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

// ---------- Roster PDF (A4 landscape) ----------

const COLS: { label: string; width: string; align?: "right" }[] = [
  { label: "Member", width: "16%" },
  { label: "Present", width: "8%", align: "right" },
  { label: "Late", width: "6%", align: "right" },
  { label: "Absent", width: "7%", align: "right" },
  { label: "Attendance", width: "9%", align: "right" },
  { label: "Punctuality", width: "9%", align: "right" },
  { label: "Hours", width: "11%", align: "right" },
  { label: "Completion", width: "9%", align: "right" },
  { label: "Avg grade", width: "9%", align: "right" },
  { label: "Lessons", width: "8%", align: "right" },
  { label: "Subs", width: "8%", align: "right" },
];

function RosterPdf({
  rows,
  monthKey,
  scopeLabel,
}: {
  rows: MemberMonthReport[];
  monthKey: string;
  scopeLabel: string;
}) {
  const n = rows.length || 1;
  const avgAtt = Math.round(rows.reduce((a, r) => a + r.attendancePct, 0) / n);
  const avgPun = Math.round(rows.reduce((a, r) => a + r.punctualityPct, 0) / n);
  const avgCompletion = Math.round(rows.reduce((a, r) => a + r.completionPct, 0) / n);
  const totalHours = rows.reduce((a, r) => a + r.activeSec, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header
          title="Monthly training report"
          subtitle={`${scopeLabel} · ${monthLabel(monthKey)} · ${rows.length} member${rows.length === 1 ? "" : "s"}`}
        />

        <View style={[s.row, { gap: 8, marginBottom: 14 }]}>
          <View style={s.tile}>
            <Text style={[s.tilePct, { color: pctColor(avgAtt), fontSize: 15 }]}>{avgAtt}%</Text>
            <Text style={s.tileLabel}>Avg attendance</Text>
          </View>
          <View style={s.tile}>
            <Text style={[s.tilePct, { color: pctColor(avgPun), fontSize: 15 }]}>{avgPun}%</Text>
            <Text style={s.tileLabel}>Avg punctuality</Text>
          </View>
          <View style={s.tile}>
            <Text style={[s.tilePct, { color: pctColor(avgCompletion), fontSize: 15 }]}>
              {avgCompletion}%
            </Text>
            <Text style={s.tileLabel}>Avg course completion</Text>
          </View>
          <View style={s.tile}>
            <Text style={[s.tilePct, { fontSize: 15 }]}>{hoursStr(totalHours)}</Text>
            <Text style={s.tileLabel}>Total hours</Text>
          </View>
        </View>

        <View style={[s.tableRow, { borderBottomWidth: 1, borderBottomColor: INK }]}>
          {COLS.map((c) => (
            <Text
              key={c.label}
              style={[s.th, { width: c.width, textAlign: c.align ?? "left" }]}
            >
              {c.label}
            </Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.userId} style={s.tableRow} wrap={false}>
            <Text style={[s.td, { width: COLS[0].width, fontFamily: "Helvetica-Bold" }]}>
              {r.fullName}
            </Text>
            <Text style={[s.td, { width: COLS[1].width, textAlign: "right" }]}>
              {r.presentDays}/{r.workingDayCount}
            </Text>
            <Text
              style={[s.td, { width: COLS[2].width, textAlign: "right", color: r.lateDays ? AMBER : INK }]}
            >
              {r.lateDays}
            </Text>
            <Text
              style={[s.td, { width: COLS[3].width, textAlign: "right", color: r.absentDays ? ROSE : INK }]}
            >
              {r.absentDays}
            </Text>
            <View style={[s.td, { width: COLS[4].width }]}>
              <PctPill pct={r.attendancePct} />
            </View>
            <View style={[s.td, { width: COLS[5].width }]}>
              <PctPill pct={r.punctualityPct} />
            </View>
            <Text style={[s.td, { width: COLS[6].width, textAlign: "right" }]}>
              {hoursStr(r.activeSec)} ({r.hoursPct}%)
            </Text>
            <View style={[s.td, { width: COLS[7].width }]}>
              <PctPill pct={r.completionPct} />
            </View>
            <View style={[s.td, { width: COLS[8].width }]}>
              {r.gradedCount > 0 ? (
                <PctPill pct={r.gradeAvgPct} />
              ) : (
                <Text style={{ textAlign: "right", color: MUTED }}>—</Text>
              )}
            </View>
            <Text style={[s.td, { width: COLS[9].width, textAlign: "right" }]}>
              {r.lessonsCompleted}
            </Text>
            <Text style={[s.td, { width: COLS[10].width, textAlign: "right" }]}>
              {r.submissionsCount}
            </Text>
          </View>
        ))}

        <Footer />
      </Page>
    </Document>
  );
}

// ---------- Member report card PDF (A4 portrait, 2 pages) ----------

function dayCellColors(d: ReportDay): { bg: string; fg: string } {
  switch (d.status) {
    case "present":
      return { bg: GREEN_BG, fg: GREEN };
    case "late":
      return { bg: AMBER_BG, fg: AMBER };
    case "very_late":
      return { bg: ROSE_BG, fg: ROSE };
    case "absent":
      return { bg: "#fff1f2", fg: "#fda4af" };
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

function MemberCardPdf({
  member,
  monthKey,
  scopeLabel,
}: {
  member: MemberMonthReport;
  monthKey: string;
  scopeLabel: string;
}) {
  const firstDowIdx = member.days[0]
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(member.days[0].dow)
    : 0;
  const padding = Math.max(0, firstDowIdx);
  const CELL_W = `${100 / 7}%`;

  const tiles: { label: string; pct: number | null; text?: string; sub: string }[] = [
    {
      label: "Attendance",
      pct: member.attendancePct,
      sub: `${member.presentDays} of ${member.workingDayCount} days`,
    },
    {
      label: "Punctuality",
      pct: member.punctualityPct,
      sub: `${member.onTimeDays} on time · ${member.lateDays} late`,
    },
    {
      label: "Hours target",
      pct: member.hoursPct,
      sub: `${hoursStr(member.activeSec)} of ${hoursStr(member.targetSec)}`,
    },
    {
      label: "Course completion",
      pct: member.completionPct,
      sub: `${member.courses.length} assigned course${member.courses.length === 1 ? "" : "s"}`,
    },
    {
      label: "Avg grade",
      pct: member.gradedCount > 0 ? member.gradeAvgPct : null,
      text: member.gradedCount > 0 ? undefined : "—",
      sub:
        member.gradedCount > 0
          ? `${member.gradedCount} graded · ${member.gradePassRate}% pass`
          : "Nothing graded this month",
    },
    {
      label: "Submissions",
      pct: null,
      text: `${member.submissionsCount}`,
      sub: `${member.gradedCount} graded · ${member.gradePending} pending QA`,
    },
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header
          title={member.fullName}
          subtitle={`${scopeLabel} · Training report card · ${monthLabel(monthKey)}`}
        />

        {/* Percentage tiles — 2 rows of 3 */}
        <View style={[s.row, { gap: 8, marginBottom: 8 }]}>
          {tiles.slice(0, 3).map((t) => (
            <View key={t.label} style={s.tile}>
              <Text style={[s.tilePct, { color: t.pct != null ? pctColor(t.pct) : INK }]}>
                {t.text ?? `${t.pct}%`}
              </Text>
              <Text style={s.tileLabel}>{t.label}</Text>
              <Text style={s.tileSub}>{t.sub}</Text>
            </View>
          ))}
        </View>
        <View style={[s.row, { gap: 8, marginBottom: 14 }]}>
          {tiles.slice(3).map((t) => (
            <View key={t.label} style={s.tile}>
              <Text style={[s.tilePct, { color: t.pct != null ? pctColor(t.pct) : INK }]}>
                {t.text ?? `${t.pct}%`}
              </Text>
              <Text style={s.tileLabel}>{t.label}</Text>
              <Text style={s.tileSub}>{t.sub}</Text>
            </View>
          ))}
        </View>

        {/* Per-course standing */}
        {member.courses.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.section}>COURSE PROGRESS (CURRENT STANDING)</Text>
            {member.courses.slice(0, 8).map((c) => (
              <View key={c.courseId} style={{ marginBottom: 6 }}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>
                    {c.title}
                  </Text>
                  <Text style={{ fontSize: 8, color: MUTED }}>
                    {c.pct}% · {c.done}/{c.total} lessons
                  </Text>
                </View>
                <View
                  style={{ height: 5, backgroundColor: OFF_BG, borderRadius: 3 }}
                >
                  <View
                    style={{
                      height: 5,
                      width: `${Math.min(100, c.pct)}%`,
                      backgroundColor: pctColor(c.pct),
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Month calendar */}
        <Text style={s.section}>ATTENDANCE CALENDAR</Text>
        <View style={s.row}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <Text
              key={d}
              style={{
                width: CELL_W,
                fontSize: 7,
                color: MUTED,
                textAlign: "center",
                marginBottom: 3,
              }}
            >
              {d}
            </Text>
          ))}
        </View>
        <View style={[s.row, { flexWrap: "wrap" }]}>
          {Array.from({ length: padding }).map((_, i) => (
            <View key={`pad-${i}`} style={{ width: CELL_W, height: 30 }} />
          ))}
          {member.days.map((d) => {
            const c = dayCellColors(d);
            return (
              <View key={d.date} style={{ width: CELL_W, padding: 1.5 }}>
                <View
                  style={{
                    backgroundColor: c.bg,
                    borderRadius: 3,
                    height: 27,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: c.fg }}>
                    {parseInt(d.date.slice(8), 10)}
                  </Text>
                  {d.activeSec > 0 && d.status !== "off" ? (
                    <Text style={{ fontSize: 6, color: c.fg }}>
                      {(d.activeSec / 3600).toFixed(1)}h
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 6, color: c.fg }}>
                      {d.status === "absent" ? "abs" : d.status === "off" ? "off" : " "}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={[s.row, { gap: 10, marginTop: 8 }]}>
          {(
            [
              ["On time", GREEN_BG, GREEN],
              ["Late", AMBER_BG, AMBER],
              ["Very late", ROSE_BG, ROSE],
              ["Absent", "#fff1f2", "#fda4af"],
              ["Off / upcoming", OFF_BG, "#9ca3af"],
            ] as const
          ).map(([label, bg, fg]) => (
            <View key={label} style={[s.row, { alignItems: "center", gap: 3 }]}>
              <View style={{ width: 7, height: 7, backgroundColor: bg, borderWidth: 0.5, borderColor: fg, borderRadius: 2 }} />
              <Text style={{ fontSize: 7, color: MUTED }}>{label}</Text>
            </View>
          ))}
        </View>

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

// ---------- Download helpers ----------

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
