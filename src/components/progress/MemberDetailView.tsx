import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchMemberDetail,
  type MemberDetail,
} from "@/lib/member-progress";
import { CompletionBar } from "./CompletionBar";
import { AttendanceStrip } from "./AttendanceStrip";
import { attendancePercent } from "@/lib/attendance-utils";
import { updateExpectedDailyHours } from "@/lib/work-session.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { MemberTodayReport } from "@/components/day-report/MemberTodayReport";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  userId: string;
  canEditSchedule?: boolean;
}

import { formatDuration } from "@/lib/format-duration";

function fmtHours(sec: number) {
  return formatDuration(sec);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DAY_ORDER = ["mon","tue","wed","thu","fri","sat","sun"] as const;
const DAY_LABEL: Record<string, string> = { mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat", sun:"Sun" };

function formatWorkingDays(days: string[]): string {
  const sorted = [...days].sort((a, b) => DAY_ORDER.indexOf(a as any) - DAY_ORDER.indexOf(b as any));
  if (sorted.length === 5 && ["mon","tue","wed","thu","fri"].every(d => sorted.includes(d))) return "Mon–Fri";
  if (sorted.length === 6 && ["mon","tue","wed","thu","fri","sat"].every(d => sorted.includes(d))) return "Mon–Sat";
  return sorted.map(d => DAY_LABEL[d] ?? d).join(", ");
}

export function MemberDetailView({ userId, canEditSchedule = false }: Props) {
  const [data, setData] = React.useState<MemberDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editHours, setEditHours] = React.useState<number | null>(null);
  const [savingHours, setSavingHours] = React.useState(false);
  const updateHoursFn = useServerFn(updateExpectedDailyHours);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const d = await fetchMemberDetail(userId);
    setData(d);
    setEditHours(d?.expectedDailyHours ?? null);
    setLoading(false);
  }, [userId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function saveHours() {
    if (editHours == null || !data) return;
    setSavingHours(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await updateHoursFn({
        data: { userId, hours: editHours, accessToken: sess.session?.access_token },
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Saved");
        reload();
      }
    } finally {
      setSavingHours(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading member progress…</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Member not found or you don't have access.</p>;
  }

  const k = data.kpis;
  const chartData = data.hoursByCourse.slice(0, 12);
  const hoursColor =
    k.hoursThisWeek >= data.targetHoursWeek
      ? "text-emerald-300"
      : k.hoursThisWeek >= data.targetHoursWeek * 0.7
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{data.fullName}</h1>
          {data.franchiseName && (
            <p className="text-sm text-muted-foreground">{data.franchiseName}</p>
          )}
        </div>
        {canEditSchedule ? (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="exp-hours" className="text-xs">Expected daily hours</Label>
              <Input
                id="exp-hours"
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={editHours ?? 8}
                onChange={(e) => setEditHours(Number(e.target.value) || 0)}
                className="h-8 w-24"
              />
            </div>
            <Button
              size="sm"
              onClick={saveHours}
              disabled={savingHours || editHours === data.expectedDailyHours}
            >
              {savingHours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Expected: <span className="font-medium text-foreground">{data.expectedDailyHours}h/day</span>
            {" · "}
            <span className="font-medium text-foreground">{formatWorkingDays(data.workingDays)}</span>
          </p>
        )}
      </header>

      <MemberTodayReport userId={userId} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Kpi label="Completion" value={`${k.completionPct}%`} />
        <Kpi
          label="Hours (7d)"
          value={formatDuration(k.hoursThisWeek * 3600)}
          subtitle={`target ${formatDuration(data.targetHoursWeek * 3600)}`}
          valueClass={hoursColor}
        />
        <Kpi label="Hours (all)" value={formatDuration(k.hoursAllTime * 3600)} />
        <Kpi label="Attendance" value={`${k.attendancePct14d}%`} />
        <Kpi label="Avg grade" value={k.avgGrade != null ? `${k.avgGrade}` : "—"} />
        <Kpi label="Pending QA" value={`${k.pendingQa}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">14-day attendance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AttendanceStrip cells={data.attendance14d} />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Legend swatch="bg-emerald-500/80" label="Present" />
            <Legend swatch="bg-amber-500/80" label="Late (after 10:00 PKT)" />
            <Legend swatch="bg-rose-500/60" label="Absent" />
            <Legend swatch="bg-muted/60" label="Off (Sat/Sun)" />
            <span className="ml-auto">
              {attendancePercent(data.attendance14d)}% of expected working days
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hours by course (all time)</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No study time logged yet.</p>
            ) : (
              <div style={{ width: "100%", height: Math.max(160, chartData.length * 28) }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="title" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number) => [`${v}h`, "Hours"]}
                      contentStyle={{ background: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                    />
                    <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="oklch(0.62 0.24 268)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-course progress</CardTitle>
          </CardHeader>
          <CardContent>
            {data.courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses assigned.</p>
            ) : (
              <ul className="space-y-3">
                {data.courses.map((c) => (
                  <li key={c.courseId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.title}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.avgGrade != null && (
                          <Badge variant="outline">Avg {c.avgGrade}</Badge>
                        )}
                        {c.pendingQa > 0 && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                            {c.pendingQa} pending
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <CompletionBar value={c.completionPct} className="flex-1" />
                      <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                        {c.done}/{c.total}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.recentSessions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-border/60 bg-card/50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium">
                      {fmtDateTime(s.startedAt)}
                      {s.endedAt
                        ? ` → ${fmtDateTime(s.endedAt)}`
                        : Date.now() - new Date(s.startedAt).getTime() < 10 * 60 * 1000
                          ? " · live"
                          : " · ended (no clock-out)"}
                    </span>
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="font-mono">
                        {fmtHours(s.activeSeconds)}
                      </Badge>
                      {s.endReason && (
                        <Badge
                          variant="outline"
                          className={
                            s.endReason.startsWith("auto_idle")
                              ? "border-amber-500/40 text-amber-300"
                              : ""
                          }
                        >
                          {s.endReason.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  subtitle,
  valueClass,
}: {
  label: string;
  value: string;
  subtitle?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
