import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, Clock, Users } from "lucide-react";

export const Route = createFileRoute("/ceo/attendance")({
  component: CeoAttendancePage,
});

interface FranchiseRollup {
  franchise_id: string | null;
  name: string;
  member_count: number;
  active_today: number;
  active_week: number;
  live_now: number;
}

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function CeoAttendancePage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<FranchiseRollup[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [{ data: franchises }, { data: profiles }, { data: sessions }] = await Promise.all([
      supabase.from("franchises").select("id, name").is("archived_at", null),
      supabase.from("profiles").select("id, franchise_id"),
      supabase
        .from("study_sessions")
        .select("user_id, active_seconds, started_at, ended_at")
        .gte("started_at", weekStart.toISOString()),
    ]);

    const userToFranchise = new Map<string, string | null>();
    const franchiseMembers = new Map<string | null, number>();
    for (const p of profiles ?? []) {
      userToFranchise.set(p.id, p.franchise_id);
      franchiseMembers.set(p.franchise_id, (franchiseMembers.get(p.franchise_id) ?? 0) + 1);
    }

    const acc = new Map<string | null, FranchiseRollup>();
    for (const f of franchises ?? []) {
      acc.set(f.id, {
        franchise_id: f.id,
        name: f.name,
        member_count: franchiseMembers.get(f.id) ?? 0,
        active_today: 0,
        active_week: 0,
        live_now: 0,
      });
    }

    for (const s of sessions ?? []) {
      const fid = userToFranchise.get(s.user_id) ?? null;
      const row = acc.get(fid);
      if (!row) continue;
      const startedToday = new Date(s.started_at) >= dayStart;
      if (startedToday) row.active_today += s.active_seconds ?? 0;
      row.active_week += s.active_seconds ?? 0;
      if (!s.ended_at) row.live_now += 1;
    }
    setRows(Array.from(acc.values()).sort((a, b) => b.active_today - a.active_today));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">Attendance rollup</h1>
          <p className="text-muted-foreground mt-1">All franchises, focused minutes.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.franchise_id ?? "none"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {r.name}
                {r.live_now > 0 && (
                  <Badge className="ml-auto bg-green-500/15 text-green-500 border-green-500/30">
                    {r.live_now} live
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {r.member_count} members
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Today
                </div>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {fmt(r.active_today)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> 7 days
                </div>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {fmt(r.active_week)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
