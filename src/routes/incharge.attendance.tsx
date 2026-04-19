import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Camera, Clock, Coffee, Eye, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/incharge/attendance")({
  component: AttendancePage,
});

interface MemberRow {
  user_id: string;
  full_name: string;
  active_today: number;
  idle_today: number;
  active_week: number;
  last_seen: string | null;
  snap_count: number;
  open_session: boolean;
}

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function AttendancePage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<MemberRow[]>([]);
  const [openMember, setOpenMember] = React.useState<MemberRow | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name");
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Member"]));

    const { data: sessions } = await supabase
      .from("study_sessions")
      .select("user_id, active_seconds, idle_seconds, started_at, last_heartbeat_at, ended_at")
      .gte("started_at", weekStart.toISOString());

    const { data: snaps } = await supabase
      .from("attendance_snapshots")
      .select("user_id")
      .gte("captured_at", dayStart.toISOString());

    const acc = new Map<string, MemberRow>();
    for (const s of sessions ?? []) {
      const r = acc.get(s.user_id) ?? {
        user_id: s.user_id,
        full_name: profileMap.get(s.user_id) ?? "Member",
        active_today: 0,
        idle_today: 0,
        active_week: 0,
        last_seen: null,
        snap_count: 0,
        open_session: false,
      };
      const startedToday = new Date(s.started_at) >= dayStart;
      if (startedToday) {
        r.active_today += s.active_seconds ?? 0;
        r.idle_today += s.idle_seconds ?? 0;
      }
      r.active_week += s.active_seconds ?? 0;
      const lh = s.last_heartbeat_at ?? s.started_at;
      if (!r.last_seen || lh > r.last_seen) r.last_seen = lh;
      if (!s.ended_at) r.open_session = true;
      acc.set(s.user_id, r);
    }
    for (const s of snaps ?? []) {
      const r = acc.get(s.user_id);
      if (r) r.snap_count += 1;
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
          <h1 className="text-3xl font-display font-semibold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground mt-1">
            Time tracked per member in your franchise.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No sessions yet. Members need to clock in from their Focus page.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.user_id} className="hover:border-primary/30 transition-colors">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium flex items-center gap-2">
                    {r.full_name}
                    {r.open_session && (
                      <Badge className="bg-green-500/15 text-green-500 border-green-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1 animate-pulse" />
                        Live
                      </Badge>
                    )}
                  </div>
                  {r.last_seen && (
                    <div className="text-xs text-muted-foreground">
                      Last seen {new Date(r.last_seen).toLocaleString()}
                    </div>
                  )}
                </div>
                <Cell label="Today active" icon={Clock} value={fmt(r.active_today)} />
                <Cell label="Today idle" icon={Coffee} value={fmt(r.idle_today)} />
                <Cell label="7-day total" icon={Clock} value={fmt(r.active_week)} />
                <Cell label="Snapshots" icon={Camera} value={r.snap_count.toString()} />
                <Button size="sm" variant="outline" onClick={() => setOpenMember(r)}>
                  <Eye className="h-4 w-4 mr-1" /> Snapshots
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SnapshotDialog member={openMember} onClose={() => setOpenMember(null)} />
    </div>
  );
}

function Cell({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-[100px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-base font-display font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SnapshotDialog({ member, onClose }: { member: MemberRow | null; onClose: () => void }) {
  const [snaps, setSnaps] = React.useState<
    { id: string; storage_path: string; kind: string; captured_at: string; signedUrl?: string }[]
  >([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!member) return;
    setLoading(true);
    (async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("attendance_snapshots")
        .select("id, storage_path, kind, captured_at")
        .eq("user_id", member.user_id)
        .gte("captured_at", dayStart.toISOString())
        .order("captured_at", { ascending: false })
        .limit(48);
      const withUrls = await Promise.all(
        (data ?? []).map(async (s) => {
          const { data: signed } = await supabase.storage
            .from("attendance")
            .createSignedUrl(s.storage_path, 600);
          return { ...s, signedUrl: signed?.signedUrl };
        }),
      );
      setSnaps(withUrls);
      setLoading(false);
    })();
  }, [member]);

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{member?.full_name} — today's snapshots</DialogTitle>
          <DialogDescription>Most recent webcam and screen check-ins.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : snaps.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No snapshots today.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
            {snaps.map((s) => (
              <div key={s.id} className="rounded-md overflow-hidden border border-white/10 relative">
                {s.signedUrl ? (
                  <img src={s.signedUrl} alt={s.kind} className="aspect-video object-cover w-full" />
                ) : (
                  <div className="aspect-video bg-muted" />
                )}
                <div className="px-2 py-1 text-[10px] flex justify-between bg-black/40">
                  <span className="capitalize">{s.kind}</span>
                  <span>{new Date(s.captured_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
