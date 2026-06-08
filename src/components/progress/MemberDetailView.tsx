import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchMemberDetail,
  type MemberDetail,
} from "@/lib/member-progress";
import { CompletionBar } from "./CompletionBar";
import { AttendanceStrip } from "./AttendanceStrip";
import { attendancePercent } from "@/lib/attendance-utils";
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
}

export function MemberDetailView({ userId }: Props) {
  const [data, setData] = React.useState<MemberDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const d = await fetchMemberDetail(userId);
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading member progress…</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Member not found or you don't have access.</p>;
  }

  const k = data.kpis;
  const chartData = data.hoursByCourse.slice(0, 12);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{data.fullName}</h1>
        {data.franchiseName && (
          <p className="text-sm text-muted-foreground">{data.franchiseName}</p>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Kpi label="Completion" value={`${k.completionPct}%`} />
        <Kpi label="Hours (7d)" value={`${k.hoursThisWeek.toFixed(1)}h`} />
        <Kpi label="Hours (all)" value={`${k.hoursAllTime.toFixed(1)}h`} />
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
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    />
                    <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="hsl(var(--primary))" />
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
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
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
