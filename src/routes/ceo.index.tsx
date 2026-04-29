import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  BookOpen,
  Users,
  FileCheck,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { GradePieCard } from "@/components/grading/GradePieCard";
import {
  AttentionList,
  FranchiseLeaderboard,
  InchargeScorecard,
  PillarCoverageBars,
  type AttentionItem,
  type FranchiseRow,
  type InchargeRow,
  type PillarRow,
} from "@/components/dashboard/ProgressPrimitives";
import {
  aggregateGrades,
  emptyAggregate,
  type GradeAggregate,
  type GradedRow,
} from "@/lib/grade-utils";
import { combineAggregates } from "@/lib/grade-summary";
import { computeInchargeKpis, computeMemberRisk } from "@/lib/progress-signals";

export const Route = createFileRoute("/ceo/")({
  component: CeoDashboard,
  errorComponent: CeoDashboardError,
});

function CeoDashboardError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold">Couldn't load the dashboard</h2>
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

interface Stats {
  franchises: number;
  courses: number;
  members: number;
  pendingSubmissions: number;
}

async function fetchStats(): Promise<Stats> {
  const [f, c, m, s] = await Promise.all([
    supabase.from("franchises").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return {
    franchises: f.count ?? 0,
    courses: c.count ?? 0,
    members: m.count ?? 0,
    pendingSubmissions: s.count ?? 0,
  };
}

interface LessonShape {
  id: string;
  sections: { course_id: string; courses: { id: string; title: string } | null } | null;
}

interface OrgPerformance {
  org: GradeAggregate;
  perFranchise: FranchiseRow[];
  attention: AttentionItem[];
  incharges: InchargeRow[];
  pillars: PillarRow[];
}

async function fetchOrgPerformance(): Promise<OrgPerformance> {
  try {
    const [{ data: franchises }, { data: profiles }, { data: roles }, { data: subs }] =
      await Promise.all([
        supabase
          .from("franchises")
          .select("id,name,manager_id")
          .is("archived_at", null)
          .order("name"),
        supabase.from("profiles").select("id,full_name,franchise_id"),
        supabase.from("user_roles").select("user_id,role,franchise_id"),
        supabase
          .from("submissions")
          .select(
            "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
          ),
      ]);

    const memberSet = new Set<string>();
    const inchargeSet = new Set<string>();
    for (const r of roles ?? []) {
      if (r.role === "member") memberSet.add(r.user_id);
      else if (r.role === "incharge") inchargeSet.add(r.user_id);
    }
    const profileById = new Map<string, { full_name: string | null; franchise_id: string | null }>();
    for (const p of profiles ?? []) {
      profileById.set(p.id, { full_name: p.full_name, franchise_id: p.franchise_id });
    }

    const allRows = (subs ?? []) as GradedRow[];

    // Lesson → course lookup for pillar bars
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

    // Per-member aggregates
    const subsByUser = new Map<string, GradedRow[]>();
    for (const r of allRows) {
      const arr = subsByUser.get(r.user_id) ?? [];
      arr.push(r);
      subsByUser.set(r.user_id, arr);
    }
    const aggByUser = new Map<string, GradeAggregate>();
    for (const id of memberSet) {
      aggByUser.set(id, aggregateGrades(subsByUser.get(id) ?? []));
    }

    // Pull recent activity per member (limit query size)
    const memberIds = Array.from(memberSet);
    const { data: sessions } = memberIds.length
      ? await supabase
          .from("study_sessions")
          .select("user_id,started_at")
          .in("user_id", memberIds)
          .order("started_at", { ascending: false })
          .limit(5000)
      : { data: [] as { user_id: string; started_at: string }[] };
    const lastActivityByUser = new Map<string, string | null>();
    for (const id of memberIds) lastActivityByUser.set(id, null);
    for (const s of (sessions ?? []) as { user_id: string; started_at: string }[]) {
      const cur = lastActivityByUser.get(s.user_id);
      if (!cur || new Date(s.started_at) > new Date(cur)) {
        lastActivityByUser.set(s.user_id, s.started_at);
      }
    }
    // Combine with most recent submission timestamp
    for (const [uid, rows] of subsByUser) {
      const t = rows
        .map((r) => r.reviewed_at ?? r.created_at)
        .filter(Boolean)
        .sort()
        .pop();
      const cur = lastActivityByUser.get(uid);
      if (!cur || (t && new Date(t) > new Date(cur))) {
        lastActivityByUser.set(uid, t ?? null);
      }
    }

    // Per-franchise rows
    const perFranchise: FranchiseRow[] = (franchises ?? []).map((f) => {
      const ids = Array.from(memberSet).filter(
        (id) => profileById.get(id)?.franchise_id === f.id,
      );
      const aggs = ids.map((id) => aggByUser.get(id) ?? emptyAggregate());
      const agg = combineAggregates(aggs);
      const subsHere = ids.flatMap((id) => subsByUser.get(id) ?? []);
      const pendingCount = subsHere.filter((s) => s.status === "pending").length;
      const lastGraded = subsHere
        .map((s) => s.reviewed_at)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      const inchargeName = f.manager_id
        ? profileById.get(f.manager_id)?.full_name ?? null
        : null;
      return {
        id: f.id,
        name: f.name,
        inchargeName,
        memberCount: ids.length,
        agg,
        pendingCount,
        lastGradedAt: lastGraded ?? null,
      };
    });

    // Org-wide
    const org = combineAggregates(aggByUser.values());

    // Attention list (academy-wide)
    const attention: AttentionItem[] = [];
    for (const id of memberSet) {
      const agg = aggByUser.get(id) ?? emptyAggregate();
      const lastAct = lastActivityByUser.get(id) ?? null;
      const signal = computeMemberRisk(agg, lastAct);
      if (signal.level === "ok") continue;
      const p = profileById.get(id);
      const fr = p?.franchise_id
        ? (franchises ?? []).find((f) => f.id === p.franchise_id)?.name ?? null
        : null;
      attention.push({
        userId: id,
        fullName: p?.full_name ?? null,
        franchiseName: fr,
        agg,
        signal,
      });
    }

    // Incharge scorecard
    const incharges: InchargeRow[] = [];
    for (const f of franchises ?? []) {
      if (!f.manager_id) continue;
      const memberIdsHere = Array.from(memberSet).filter(
        (id) => profileById.get(id)?.franchise_id === f.id,
      );
      const subsHere = memberIdsHere.flatMap((id) => subsByUser.get(id) ?? []);
      const reviewedByThem = subsHere.filter((s) => s.reviewed_by === f.manager_id);
      const pendingHere = subsHere.filter((s) => s.status === "pending");
      const kpis = computeInchargeKpis(f.manager_id, reviewedByThem, pendingHere);
      incharges.push({
        inchargeId: f.manager_id,
        inchargeName: profileById.get(f.manager_id)?.full_name ?? null,
        franchiseName: f.name,
        kpis,
        pendingInFranchise: pendingHere.length,
      });
    }

    // Pillar coverage (academy-wide)
    const pillarMap = new Map<string, { title: string; rows: GradedRow[] }>();
    for (const r of allRows) {
      if (!r.letter_grade) continue;
      if (!memberSet.has(r.user_id)) continue;
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

    return { org, perFranchise, attention, incharges, pillars };
  } catch (e) {
    console.error("fetchOrgPerformance failed", e);
    return {
      org: emptyAggregate(),
      perFranchise: [],
      attention: [],
      incharges: [],
      pillars: [],
    };
  }
}

function CeoDashboard() {
  const { profile } = useAuth();
  const statsQuery = useQuery({ queryKey: ["ceo", "stats"], queryFn: fetchStats });
  const perfQuery = useQuery({ queryKey: ["ceo", "org-performance"], queryFn: fetchOrgPerformance });
  const stats = statsQuery.data;
  const perf = perfQuery.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Academy-wide progress review.
        </p>
      </header>

      {/* Hero strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile to="/ceo/franchises" label="Franchises" value={stats?.franchises} icon={Building2} />
        <StatTile to="/ceo/courses" label="Courses" value={stats?.courses} icon={BookOpen} />
        <StatTile to="/ceo/franchises" label="Users" value={stats?.members} icon={Users} />
        <StatTile
          to="/ceo/submissions"
          label="Pending grading"
          value={stats?.pendingSubmissions}
          icon={FileCheck}
          tone={(stats?.pendingSubmissions ?? 0) > 0 ? "amber" : "default"}
        />
      </div>

      {/* Org donut */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-accent" /> Academy performance
              </CardTitle>
              <CardDescription>
                Overall grade mix across every franchise — A+ 90% · A 85% · B 75% · C means redo.
              </CardDescription>
            </div>
            <Link to="/ceo/grades">
              <Button variant="outline" size="sm">
                Full report <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-2">
            {perf ? (
              <GradePieCard agg={perf.org} size={280} />
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                Loading performance…
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Franchise leaderboard */}
      {perf && <FranchiseLeaderboard rows={perf.perFranchise} />}

      {/* Incharge scorecard */}
      {perf && <InchargeScorecard rows={perf.incharges} />}

      {/* Academy-wide attention */}
      {perf && (
        <AttentionList
          items={perf.attention}
          showFranchise
          emptyHint="Every member across the academy is on track. 🎉"
        />
      )}

      {/* Pillar coverage */}
      {perf && (
        <PillarCoverageBars
          rows={perf.pillars}
          description="Average grade per pillar across the entire academy."
        />
      )}
    </div>
  );
}

function StatTile({
  to,
  label,
  value,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "amber" | "rose";
}) {
  const toneCls =
    tone === "amber" ? "text-amber-300" : tone === "rose" ? "text-rose-300" : "text-foreground";
  return (
    <Link to={to} className="group block">
      <Card className="hover-lift transition-colors group-hover:border-accent/40">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${toneCls}`}>
              {value ?? "—"}
            </p>
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

// Bootstrap helper rendered when no role exists
export function ClaimCeoCard({ onClaimed }: { onClaimed: () => void }) {
  const [busy, setBusy] = React.useState(false);
  async function claim() {
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_first_ceo");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("A CEO already exists. Ask them to invite you.");
      return;
    }
    toast.success("You're now the CEO");
    onClaimed();
  }
  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" /> Bootstrap your academy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          No CEO exists yet for this academy. Click below to claim the CEO role for your account.
          (This only works once.)
        </p>
        <Button onClick={claim} disabled={busy}>
          {busy ? "Claiming…" : "Claim CEO role"}
        </Button>
      </CardContent>
    </Card>
  );
}
