import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ClipboardList, Users, ArrowRight, GraduationCap } from "lucide-react";
import { CourseGradePie, LETTER_COLORS, type PieSlice } from "@/components/grading/CourseGradePie";
import {
  aggregateGrades,
  emptyAggregate,
  type GradedRow,
  type GradeAggregate,
} from "@/lib/grade-utils";

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

function buildSlices(agg: GradeAggregate): PieSlice[] {
  return [
    { name: "A+", value: agg.aPlus, color: LETTER_COLORS["A+"] },
    { name: "A",  value: agg.a,     color: LETTER_COLORS["A"] },
    { name: "B",  value: agg.b,     color: LETTER_COLORS["B"] },
    { name: "C",  value: agg.c,     color: LETTER_COLORS["C"] },
  ];
}

function InchargeDashboard() {
  const { profile, roles } = useAuth();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [perMember, setPerMember] = React.useState<Record<string, GradeAggregate>>({});
  const [franchiseAgg, setFranchiseAgg] = React.useState<GradeAggregate>(emptyAggregate());
  const [pendingCount, setPendingCount] = React.useState<number>(0);
  const [franchiseName, setFranchiseName] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
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
          }
          return;
        }

        // Pull members + franchise meta in parallel
        const [{ data: profs }, { data: franchise }, { data: roleRows }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name")
            .eq("franchise_id", franchiseId),
          supabase.from("franchises").select("name").eq("id", franchiseId).maybeSingle(),
          supabase
            .from("user_roles")
            .select("user_id, role")
            .eq("franchise_id", franchiseId)
            .eq("role", "member"),
        ]);
        const memberIdSet = new Set((roleRows ?? []).map((r) => r.user_id));
        const memberList = (profs ?? [])
          .filter((p) => memberIdSet.has(p.id))
          .map((p) => ({ id: p.id, full_name: p.full_name })) as Member[];
        memberList.sort((a, b) =>
          (a.full_name ?? "").localeCompare(b.full_name ?? ""),
        );
        const userIds = memberList.map((m) => m.id);

        // Pending submissions count
        const { count: pending } = userIds.length
          ? await supabase
              .from("submissions")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
              .in("user_id", userIds)
          : { count: 0 };

        // All graded submissions for these members
        const { data: subs } = userIds.length
          ? await supabase
              .from("submissions")
              .select(
                "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
              )
              .in("user_id", userIds)
          : { data: [] };

        if (cancelled) return;

        const allRows = (subs ?? []) as GradedRow[];
        const byMember: Record<string, GradedRow[]> = {};
        for (const m of memberList) byMember[m.id] = [];
        for (const r of allRows) {
          if (byMember[r.user_id]) byMember[r.user_id].push(r);
        }
        const aggMap: Record<string, GradeAggregate> = {};
        for (const m of memberList) aggMap[m.id] = aggregateGrades(byMember[m.id] ?? []);

        setMembers(memberList);
        setPendingCount(pending ?? 0);
        setFranchiseName(franchise?.name ?? null);
        setPerMember(aggMap);
        setFranchiseAgg(aggregateGrades(allRows));
      } catch (e) {
        console.error("Incharge dashboard failed", e);
        if (!cancelled) {
          setPerMember({});
          setFranchiseAgg(emptyAggregate());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.franchise_id, roles]);

  const franchiseSlices = buildSlices(franchiseAgg);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {profile?.full_name?.split(" ")[0] ?? "Incharge"}'s franchise
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grade distribution across {franchiseName ?? "your franchise"}—each pie shows the
          A+ / A / B / C mix for one member.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Team members"
          value={members.length}
          icon={Users}
          gradient="from-[oklch(0.55_0.21_268)] to-[oklch(0.55_0.21_290)]"
        />
        <StatTile
          label="Pending reviews"
          value={pendingCount}
          icon={ClipboardList}
          to="/incharge/reviews"
          gradient="from-[oklch(0.78_0.16_75)] to-[oklch(0.62_0.20_25)]"
        />
        <StatTile
          label="Graded this franchise"
          value={franchiseAgg.total}
          icon={GraduationCap}
          gradient="from-[oklch(0.62_0.18_145)] to-[oklch(0.55_0.18_205)]"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-display text-xl">Franchise grades</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {franchiseAgg.total} graded submission{franchiseAgg.total === 1 ? "" : "s"}
                {franchiseAgg.total > 0 && (
                  <> · avg {franchiseAgg.averagePercent}% · pass rate {franchiseAgg.passRate}%</>
                )}
              </p>
            </div>
            <LegendRow />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mx-auto max-w-sm">
            <CourseGradePie
              data={franchiseSlices}
              centerLabel={`${franchiseAgg.averagePercent}%`}
              centerSub="avg score"
              height={260}
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Per-member grades</h2>
          <LegendRow />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const agg = perMember[m.id] ?? emptyAggregate();
            const slices = buildSlices(agg);
            return (
              <Card key={m.id} className="hover-lift">
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium">
                    {m.full_name ?? "Unnamed member"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {agg.total === 0
                      ? "No grades yet"
                      : `${agg.total} graded · avg ${agg.averagePercent}%`}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <CourseGradePie
                    data={slices}
                    centerLabel={agg.total === 0 ? "—" : `${agg.averagePercent}%`}
                    centerSub={agg.total === 0 ? "no data" : "avg"}
                    height={180}
                  />
                </CardContent>
              </Card>
            );
          })}
          {members.length === 0 && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No members in your franchise yet.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function LegendRow() {
  const items: { letter: string }[] = [
    { letter: "A+" },
    { letter: "A" },
    { letter: "B" },
    { letter: "C" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.letter} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: LETTER_COLORS[i.letter] }}
          />
          {i.letter}
        </span>
      ))}
    </div>
  );
}

function StatTile({
  to,
  label,
  value,
  icon: Icon,
  gradient,
}: {
  to?: string;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}) {
  const inner = (
    <Card className="hover-lift relative overflow-hidden border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
          >
            <Icon className="h-5 w-5" />
          </div>
          {to && <ArrowRight className="h-4 w-4 text-muted-foreground/40" />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}
