import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Users, ArrowRight } from "lucide-react";
import { PillarFlower } from "@/components/PillarFlower";
import { getPillarScoresForUsers } from "@/lib/pillar-data";
import type { PillarScores } from "@/lib/pillars";

export const Route = createFileRoute("/incharge/")({
  component: InchargeDashboard,
});

interface Member {
  id: string;
  full_name: string | null;
}

function InchargeDashboard() {
  const { profile } = useAuth();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [franchiseScores, setFranchiseScores] = React.useState<PillarScores | null>(null);
  const [perMember, setPerMember] = React.useState<Record<string, PillarScores>>({});
  const [pendingCount, setPendingCount] = React.useState<number>(0);

  React.useEffect(() => {
    (async () => {
      if (!profile?.franchise_id) return;
      const [{ data: profs }, { count: pending }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("franchise_id", profile.franchise_id),
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      const memberList = (profs ?? []) as Member[];
      setMembers(memberList);
      setPendingCount(pending ?? 0);

      const userIds = memberList.map((m) => m.id);
      const fs = await getPillarScoresForUsers(userIds);
      setFranchiseScores(fs);

      // Per-member flowers
      const entries = await Promise.all(
        memberList.map(async (m) => [m.id, await getPillarScoresForUsers([m.id])] as const),
      );
      setPerMember(Object.fromEntries(entries));
    })();
  }, [profile?.franchise_id]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {profile?.full_name?.split(" ")[0] ?? "Incharge"}'s franchise
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your team's mastery across all 12 IRM Academy skill pillars.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Franchise mastery</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Average across {members.length} member{members.length === 1 ? "" : "s"}.
            Outer (darker) ring = mastered.
          </p>
        </CardHeader>
        <CardContent className="flex justify-center">
          {franchiseScores ? (
            <PillarFlower scores={franchiseScores} size={400} showLegend />
          ) : (
            <div className="h-[400px] w-[400px] flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Team mastery — individual</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const ms = perMember[m.id];
            return (
              <Card key={m.id} className="hover-lift">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    {m.full_name ?? "Unnamed member"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center pt-0">
                  {ms ? (
                    <PillarFlower
                      scores={ms}
                      size={200}
                      showLabels={false}
                    />
                  ) : (
                    <div className="h-[200px] w-[200px] flex items-center justify-center text-xs text-muted-foreground">
                      …
                    </div>
                  )}
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
