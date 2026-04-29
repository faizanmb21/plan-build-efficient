import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  ClipboardList,
  Users,
  ArrowRight,
  GraduationCap,
  TrendingUp,
  RefreshCcw,
} from "lucide-react";
import { GradePieCard } from "@/components/grading/GradePieCard";
import {
  AttentionList,
  MemberLeaderboard,
  PillarCoverageBars,
  type AttentionItem,
  type MemberRow,
  type PillarRow,
} from "@/components/dashboard/ProgressPrimitives";
import {
  aggregateGrades,
  emptyAggregate,
  type GradedRow,
  type GradeAggregate,
} from "@/lib/grade-utils";
import { computeMemberRisk } from "@/lib/progress-signals";
import { MemberGradeReport } from "@/components/MemberGradeReport";

export const Route = createFileRoute("/incharge/")({
  component: InchargeDashboard,
  errorComponent: InchargeDashboardError,
});

function InchargeDashboardError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold">Couldn't load incharge dashboard</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error?.message || "An unexpected error occurred."}
      </p>
      <Button
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

interface Member {
  id: string;
  full_name: string | null;
}

interface LessonShape {
  id: string;
  sections: { course_id: string; courses: { id: string; title: string } | null } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function InchargeDashboard() {
  const { profile, roles, user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [perMember, setPerMember] = React.useState<Record<string, GradeAggregate>>({});
  const [lastActivity, setLastActivity] = React.useState<Record<string, string | null>>({});
  const [franchiseAgg, setFranchiseAgg] = React.useState<GradeAggregate>(emptyAggregate());
  const [pendingCount, setPendingCount] = React.useState<number>(0);
  const [oldestPendingDays, setOldestPendingDays] = React.useState<number | null>(null);
  const [graded7d, setGraded7d] = React.useState(0);
  const [redos7d, setRedos7d] = React.useState(0);
  const [pillarRows, setPillarRows] = React.useState<PillarRow[]>([]);
  const [franchiseName, setFranchiseName] = React.useState<string | null>(null);
  const [drillMember, setDrillMember] = React.useState<Member | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let franchiseId = profile?.franchise_id ?? null;
        if (!franchiseId && roles.includes("ceo")) {
          const { data: firstFranchise } = await supabase
            .from("franchises")
            .select("id, name")
            .is("archived_at", null)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          franchiseId = firstFranchise?.id ?? null;
          if (!cancelled) setFranchiseName(firstFranchise?.name ?? null);
        }
        if (!franchiseId) {
          if (!cancelled) {
            setMembers([]);
            setPendingCount(0);
            setPerMember({});
            setFranchiseAgg(emptyAggregate());
            setLoading(false);
          }
          return;
        }

        const [{ data: profs }, { data: franchise }, { data: roleRows }] =
          await Promise.all([
            supabase.from("profiles").select("id, full_name").eq("franchise_id", franchiseId),
            supabase.from("franchises").select("name").eq("id", franchiseId).maybeSingle(),
            supabase
              .from("user_roles")
              .select("user_id, role")
              .eq("franchise_id", franchiseId)
              .eq("role", "member"),
          ]);
        const memberIdSet = new Set((roleRows ?? []).map((r) => r.user_id));
        const memberList = (profs ?? [])
          .filter((p) => memberIdSet.has(p.id) && p.id !== user?.id)
          .map((p) => ({ id: p.id, full_name: p.full_name })) as Member[];
        memberList.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
        const userIds = memberList.map((m) => m.id);

        if (userIds.length === 0) {
          if (!cancelled) {
            setMembers([]);
            setPendingCount(0);
            setPerMember({});
            setLastActivity({});
            setFranchiseAgg(emptyAggregate());
            setPillarRows([]);
            setFranchiseName(franchise?.name ?? null);
            setLoading(false);
          }
          return;
        }

        const [{ data: subs }, { data: sessions }] = await Promise.all([
          supabase
            .from("submissions")
            .select(
              "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
            )
            .in("user_id", userIds),
          supabase
            .from("study_sessions")
            .select("user_id,started_at")
            .in("user_id", userIds)
            .order("started_at", { ascending: false })
            .limit(2000),
        ]);

        const allRows = (subs ?? []) as GradedRow[];

        // Pillar lookup for graded submissions
        const lessonIds = Array.from(
          new Set(allRows.filter((r) => r.letter_grade).map((r) => r.lesson_id)),
        );
        const { data: lessons } = lessonIds.length
          ? await supabase
              .from("lessons")
              .select("id,sections(course_id,courses(id,title))")
              .in("id", lessonIds)
          : { data: [] as unknown[] };
        const lessonMap = new Map<string, LessonShape>();
        (lessons as LessonShape[] | null | undefined)?.forEach((l) => lessonMap.set(l.id, l));

        // Per-member submissions + last activity
        const byMember: Record<string, GradedRow[]> = {};
        for (const m of memberList) byMember[m.id] = [];
        for (const r of allRows) byMember[r.user_id]?.push(r);

        const aggMap: Record<string, GradeAggregate> = {};
        for (const m of memberList) aggMap[m.id] = aggregateGrades(byMember[m.id] ?? []);

        const lastByUser: Record<string, string | null> = {};
        for (const m of memberList) lastByUser[m.id] = null;
        for (const s of (sessions ?? []) as { user_id: string; started_at: string }[]) {
          const cur = lastByUser[s.user_id];
          if (!cur || new Date(s.started_at) > new Date(cur)) {
            lastByUser[s.user_id] = s.started_at;
          }
        }
        // Use the latest of submission or session as last activity
        for (const m of memberList) {
          const subTimes = (byMember[m.id] ?? [])
            .map((r) => r.reviewed_at ?? r.created_at)
            .filter(Boolean) as string[];
          const subMax = subTimes.length
            ? subTimes.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
            : null;
          const sessMax = lastByUser[m.id];
          lastByUser[m.id] =
            subMax && sessMax
              ? new Date(subMax) > new Date(sessMax)
                ? subMax
                : sessMax
              : subMax ?? sessMax ?? null;
        }

        // This week stats
        const sevenAgo = Date.now() - 7 * DAY_MS;
        let g7 = 0;
        let r7 = 0;
        let oldestPending: number | null = null;
        for (const r of allRows) {
          if (r.status === "pending") {
            const d = Math.floor((Date.now() - new Date(r.created_at).getTime()) / DAY_MS);
            if (oldestPending === null || d > oldestPending) oldestPending = d;
          } else if (r.reviewed_at) {
            const t = new Date(r.reviewed_at).getTime();
            if (t >= sevenAgo) {
              g7++;
              if ((r.letter_grade ?? "").trim() === "C") r7++;
            }
          }
        }

        // Pillar rows
        const pillarMap = new Map<string, { title: string; rows: GradedRow[] }>();
        for (const r of allRows) {
          if (!r.letter_grade) continue;
          const l = lessonMap.get(r.lesson_id);
          const cid = l?.sections?.courses?.id;
          const ctitle = l?.sections?.courses?.title;
          if (!cid || !ctitle) continue;
          const cur = pillarMap.get(cid) ?? { title: ctitle, rows: [] };
          cur.rows.push(r);
          pillarMap.set(cid, cur);
        }
        const pillars: PillarRow[] = Array.from(pillarMap.entries()).map(([courseId, v]) => ({
          courseId,
          title: v.title,
          agg: aggregateGrades(v.rows),
        }));

        const pendingTotal = allRows.filter((r) => r.status === "pending").length;

        if (cancelled) return;
        setMembers(memberList);
        setPerMember(aggMap);
        setLastActivity(lastByUser);
        setFranchiseAgg(aggregateGrades(allRows));
        setPendingCount(pendingTotal);
        setOldestPendingDays(oldestPending);
        setGraded7d(g7);
        setRedos7d(r7);
        setPillarRows(pillars);
        setFranchiseName(franchise?.name ?? null);
      } catch (e) {
        console.error("Incharge dashboard failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.franchise_id, roles, user?.id]);

  const memberRows: MemberRow[] = members.map((m) => {
    const agg = perMember[m.id] ?? emptyAggregate();
    const lastAct = lastActivity[m.id] ?? null;
    return {
      userId: m.id,
      fullName: m.full_name,
      agg,
      lastActivityAt: lastAct,
      signal: computeMemberRisk(agg, lastAct),
    };
  });

  const attentionItems: AttentionItem[] = memberRows.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    agg: r.agg,
    signal: r.signal,
    onView: () => setDrillMember({ id: r.userId, full_name: r.fullName }),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {profile?.full_name?.split(" ")[0] ?? "Incharge"}'s franchise
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live progress review for {franchiseName ?? "your franchise"}.
        </p>
      </header>

      {/* Hero strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Members" value={members.length} icon={Users} />
        <StatTile
          label="Pending reviews"
          value={pendingCount}
          icon={ClipboardList}
          to="/incharge/reviews"
          tone={pendingCount > 0 ? "amber" : "default"}
        />
        <StatTile
          label="Avg %"
          value={franchiseAgg.total > 0 ? `${franchiseAgg.averagePercent}%` : "—"}
          icon={GraduationCap}
        />
        <StatTile
          label="Pass rate"
          value={franchiseAgg.total > 0 ? `${franchiseAgg.passRate}%` : "—"}
          icon={TrendingUp}
        />
      </div>

      {/* Donut + this week */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Franchise grades</CardTitle>
            <CardDescription>
              A+ 90% · A 85% · B 75% · C means redo
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-0">
            <GradePieCard agg={franchiseAgg} size={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>Last 7 days of grading activity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <WeekRow label="Submissions graded" value={graded7d} />
            <WeekRow
              label="Redos issued"
              value={redos7d}
              tone={redos7d > 0 ? "rose" : "default"}
              icon={RefreshCcw}
            />
            <WeekRow
              label="Pending now"
              value={pendingCount}
              suffix={
                oldestPendingDays !== null
                  ? `· oldest ${oldestPendingDays}d`
                  : undefined
              }
              tone={
                oldestPendingDays !== null && oldestPendingDays >= 3 ? "rose" : "amber"
              }
            />
            <div className="pt-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/incharge/reviews">
                  Open review queue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attention */}
      <AttentionList items={attentionItems} />

      {/* Leaderboard */}
      <MemberLeaderboard
        rows={memberRows}
        onView={(uid) => {
          const m = members.find((mm) => mm.id === uid);
          if (m) setDrillMember(m);
        }}
        emptyHint={loading ? "Loading members…" : "No members in your franchise yet."}
      />

      {/* Pillar coverage */}
      <PillarCoverageBars rows={pillarRows} />

      <Dialog open={!!drillMember} onOpenChange={(o) => !o && setDrillMember(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {drillMember && (
            <MemberGradeReport
              userId={drillMember.id}
              fullName={drillMember.full_name}
              franchiseName={franchiseName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  to,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  tone?: "default" | "amber" | "rose";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-300"
      : tone === "rose"
        ? "text-rose-300"
        : "text-foreground";
  const inner = (
    <Card className="hover-lift">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${toneCls}`}>
            {value}
          </p>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function WeekRow({
  label,
  value,
  suffix,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "amber" | "rose";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-400"
      : tone === "rose"
        ? "text-rose-400"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-sm tabular-nums">
        <span className={`font-semibold ${toneCls}`}>{value}</span>
        {suffix && <span className="ml-1.5 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </div>
  );
}
