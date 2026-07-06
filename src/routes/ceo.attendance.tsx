import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, Clock, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/format-duration";
import { AttendanceTimesheet } from "@/components/attendance/AttendanceTimesheet";
import { AttendanceReport } from "@/components/attendance/AttendanceReport";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ceo/attendance")({
  component: CeoAttendancePage,
});

interface FranchiseRollup {
  franchise_id: string;
  name: string;
  member_count: number;
  active_today: number;
  active_week: number;
  live_now: number;
}

const LIVE_STALE_MS = 10 * 60 * 1000;
const PKT = "Asia/Karachi";

function pktDateKey(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function pktDayStartUtcIso(): string {
  const todayKey = pktDateKey(new Date());
  const [y, m, d] = todayKey.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d) - 5 * 3600_000).toISOString();
}

function CeoAttendancePage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<FranchiseRollup[]>([]);
  const [selectedFranchise, setSelectedFranchise] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const dayStartIso = pktDayStartUtcIso();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [{ data: franchises }, { data: profiles }, { data: sessions }] = await Promise.all([
      supabase.from("franchises").select("id, name").is("archived_at", null),
      supabase.from("profiles").select("id, franchise_id"),
      supabase
        .from("study_sessions")
        .select("user_id, active_seconds, started_at, ended_at, status, last_heartbeat_at")
        .gte("started_at", weekStart.toISOString()),
    ]);

    const userToFranchise = new Map<string, string | null>();
    const franchiseMembers = new Map<string | null, number>();
    for (const p of profiles ?? []) {
      userToFranchise.set(p.id, p.franchise_id);
      franchiseMembers.set(p.franchise_id, (franchiseMembers.get(p.franchise_id) ?? 0) + 1);
    }

    const acc = new Map<string, FranchiseRollup>();
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
      if (!fid) continue;
      const row = acc.get(fid);
      if (!row) continue;
      const startedToday = s.started_at >= dayStartIso;
      if (startedToday) row.active_today += s.active_seconds ?? 0;
      row.active_week += s.active_seconds ?? 0;
      const lh = (s as any).last_heartbeat_at ?? s.started_at;
      const fresh = lh ? Date.now() - new Date(lh).getTime() < LIVE_STALE_MS : false;
      if (!s.ended_at && (s as any).status !== "completed" && fresh) row.live_now += 1;
    }
    const list = Array.from(acc.values()).sort((a, b) => b.active_today - a.active_today);
    setRows(list);
    // Default detail view to the franchise with the most activity today.
    setSelectedFranchise((prev) => prev ?? list[0]?.franchise_id ?? null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const selected = rows.find((r) => r.franchise_id === selectedFranchise) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Org-wide rollup, then a Jibble-style weekly timesheet per franchise.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Refresh
        </Button>
      </div>

      {/* Franchise rollups — clickable to drill in */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Franchises ({rows.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <button
              key={r.franchise_id}
              type="button"
              onClick={() => setSelectedFranchise(r.franchise_id)}
              className={cn(
                "text-left transition-colors",
                selectedFranchise === r.franchise_id
                  ? "ring-2 ring-primary/60 rounded-lg"
                  : "",
              )}
            >
              <Card className={selectedFranchise === r.franchise_id ? "border-primary/40" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-primary" />
                    {r.name}
                    {r.live_now > 0 && (
                      <Badge className="ml-auto border-green-500/30 bg-green-500/15 text-green-500">
                        <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                        {r.live_now} live
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 text-[11px]">
                    <Users className="h-3 w-3" /> {r.member_count} members
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 pt-0">
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <Clock className="h-3 w-3" /> Today
                    </div>
                    <div className="font-display text-xl font-semibold tabular-nums">
                      {formatDuration(r.active_today)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <Clock className="h-3 w-3" /> 7 days
                    </div>
                    <div className="font-display text-xl font-semibold tabular-nums">
                      {formatDuration(r.active_week)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

      {/* Detailed timesheet + monthly report */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Attendance detail
          </h2>
          <Select
            value={selectedFranchise ?? "all"}
            onValueChange={(v) => setSelectedFranchise(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All franchises</SelectItem>
              {rows.map((r) => (
                <SelectItem key={r.franchise_id} value={r.franchise_id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs defaultValue="timesheet">
          <TabsList>
            <TabsTrigger value="timesheet">Weekly timesheet</TabsTrigger>
            <TabsTrigger value="report">Monthly report</TabsTrigger>
          </TabsList>
          <TabsContent value="timesheet" className="mt-4">
            <AttendanceTimesheet
              franchiseId={selectedFranchise}
              scopeLabel={selected?.name ?? "All franchises"}
            />
          </TabsContent>
          <TabsContent value="report" className="mt-4">
            <AttendanceReport
              franchiseId={selectedFranchise}
              scopeLabel={selected?.name ?? "All franchises"}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
