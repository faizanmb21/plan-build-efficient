import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, BookOpen, Users, FileCheck, Sparkles, ArrowRight, AlertTriangle, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { GradePieCard } from "@/components/grading/GradePieCard";
import { fetchGradeSummaries, combineAggregates } from "@/lib/grade-summary";
import type { GradeAggregate } from "@/lib/grade-utils";
import { emptyAggregate } from "@/lib/grade-utils";

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
    supabase
      .from("franchises")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  return {
    franchises: f.count ?? 0,
    courses: c.count ?? 0,
    members: m.count ?? 0,
    pendingSubmissions: s.count ?? 0,
  };
}

interface OrgPerformance {
  org: GradeAggregate;
  perFranchise: Array<{ id: string; name: string; agg: GradeAggregate; memberCount: number }>;
}

async function fetchOrgPerformance(): Promise<OrgPerformance> {
  try {
    const [{ data: franchises }, { data: profiles }, { data: memberRoles }] =
      await Promise.all([
        supabase
          .from("franchises")
          .select("id,name")
          .is("archived_at", null)
          .order("name"),
        supabase.from("profiles").select("id,franchise_id"),
        supabase.from("user_roles").select("user_id,role"),
      ]);

    const memberSet = new Set(
      (memberRoles ?? [])
        .filter((r) => r.role === "member")
        .map((r) => r.user_id),
    );
    const allMemberIds = (profiles ?? [])
      .map((p) => p.id)
      .filter((id) => memberSet.has(id));
    const summaries = await fetchGradeSummaries(allMemberIds);

    const perFranchise = (franchises ?? []).map((f) => {
      const ids = (profiles ?? [])
        .filter((p) => p.franchise_id === f.id && memberSet.has(p.id))
        .map((p) => p.id);
      const aggs = ids.map((id) => summaries.get(id) ?? emptyAggregate());
      return {
        id: f.id,
        name: f.name,
        agg: combineAggregates(aggs),
        memberCount: ids.length,
      };
    });

    const org = combineAggregates(summaries.values());
    return { org, perFranchise };
  } catch (e) {
    console.error("fetchOrgPerformance failed", e);
    return { org: emptyAggregate(), perFranchise: [] };
  }
}

function CeoDashboard() {
  const { profile } = useAuth();
  const statsQuery = useQuery({ queryKey: ["ceo", "stats"], queryFn: fetchStats });
  const perfQuery = useQuery({ queryKey: ["ceo", "org-performance"], queryFn: fetchOrgPerformance });
  const stats = statsQuery.data;
  const perf = perfQuery.data;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's a quick look at your academy.
        </p>
      </header>

      {/* Stat tiles — branded, flat icon style */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          to="/ceo/franchises"
          label="Franchises"
          value={stats?.franchises}
          icon={Building2}
          gradient="from-[oklch(0.45_0.27_268)] to-[oklch(0.55_0.21_290)]"
        />
        <StatTile
          to="/ceo/courses"
          label="Courses"
          value={stats?.courses}
          icon={BookOpen}
          gradient="from-[oklch(0.55_0.21_320)] to-[oklch(0.62_0.20_25)]"
        />
        <StatTile
          to="/ceo/franchises"
          label="Users"
          value={stats?.members}
          icon={Users}
          gradient="from-[oklch(0.62_0.18_145)] to-[oklch(0.55_0.18_205)]"
        />
        <StatTile
          to="/ceo/submissions"
          label="Pending grading"
          value={stats?.pendingSubmissions}
          icon={FileCheck}
          gradient="from-[oklch(0.78_0.16_75)] to-[oklch(0.62_0.20_25)]"
        />
      </div>

      {/* Org-wide grade performance */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-accent" />
                Academy performance
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Overall grade mix across every franchise — A+ (90%), A (85%), B (75%), C means redo.
              </p>
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
              <GradePieCard agg={perf.org} size={300} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Loading performance…
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-franchise grade donuts */}
      {perf && perf.perFranchise.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">By franchise</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a franchise to drill into its members.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {perf.perFranchise.map((f) => (
                <Link
                  key={f.id}
                  to="/ceo/franchises/$id"
                  params={{ id: f.id }}
                  className="group rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-accent/50"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        <Building2 className="h-3.5 w-3.5 text-accent shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {f.memberCount} member{f.memberCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                  </div>
                  <GradePieCard agg={f.agg} size={140} showStats={false} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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
  to: string;
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}) {
  return (
    <Link to={to} className="group block">
      <Card className="hover-lift relative overflow-hidden border-border/60 transition-colors group-hover:border-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="font-display text-3xl font-bold tracking-tight">
            {value ?? "—"}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
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
