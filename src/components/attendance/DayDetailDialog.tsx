import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatPktClock, formatWorkStartClock } from "@/lib/attendance-timesheet";
import type { DayCell } from "@/lib/attendance-timesheet";
import { formatDuration } from "@/lib/format-duration";
import { Clock, Coffee, LogIn, LogOut, AlertCircle, Camera } from "lucide-react";

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number | null;
  idle_seconds: number | null;
  status: string | null;
  end_reason: string | null;
}

interface SnapRow {
  id: string;
  storage_path: string;
  kind: string;
  captured_at: string;
  signedUrl?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  memberName: string;
  memberId: string;
  workStartTime: string;
  day: DayCell | null;
}

export function DayDetailDialog({
  open,
  onClose,
  memberName,
  memberId,
  workStartTime,
  day,
}: Props) {
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [snaps, setSnaps] = React.useState<SnapRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !day) return;
    setLoading(true);
    (async () => {
      // Day range in UTC: PKT day = UTC day + 5h offset
      const [y, m, d] = day.date.split("-").map((n) => parseInt(n, 10));
      const dayStartIso = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5 * 3600_000).toISOString();
      const dayEndIso = new Date(
        new Date(dayStartIso).getTime() + 24 * 3600_000 - 1,
      ).toISOString();

      const [sessRes, snapRes] = await Promise.all([
        supabase
          .from("study_sessions")
          .select(
            "id, started_at, ended_at, active_seconds, idle_seconds, status, end_reason",
          )
          .eq("user_id", memberId)
          .gte("started_at", dayStartIso)
          .lte("started_at", dayEndIso)
          .order("started_at", { ascending: true }),
        supabase
          .from("attendance_snapshots")
          .select("id, storage_path, kind, captured_at")
          .eq("user_id", memberId)
          .gte("captured_at", dayStartIso)
          .lte("captured_at", dayEndIso)
          .order("captured_at", { ascending: false })
          .limit(24),
      ]);

      setSessions((sessRes.data ?? []) as SessionRow[]);

      const withUrls = await Promise.all(
        ((snapRes.data ?? []) as SnapRow[]).map(async (s) => {
          const { data: signed } = await supabase.storage
            .from("attendance")
            .createSignedUrl(s.storage_path, 600);
          return { ...s, signedUrl: signed?.signedUrl };
        }),
      );
      setSnaps(withUrls);
      setLoading(false);
    })();
  }, [open, day, memberId]);

  if (!day) return null;

  const fullDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(
        parseInt(day.date.slice(0, 4), 10),
        parseInt(day.date.slice(5, 7), 10) - 1,
        parseInt(day.date.slice(8, 10), 10),
      ),
    ),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {memberName} — {fullDate}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            <StatusBadge state={day.state} />
            {day.lateMinutes > 0 && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-200">
                Late by {day.lateMinutes}m
              </Badge>
            )}
            <span className="text-muted-foreground">
              · Scheduled start {formatWorkStartClock(workStartTime)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Summary row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<LogIn className="h-3 w-3" />}
            label="Clock in"
            value={day.firstStartIso ? formatPktClock(day.firstStartIso) : "—"}
          />
          <Stat
            icon={<LogOut className="h-3 w-3" />}
            label="Last clock out"
            value={day.lastEndIso ? formatPktClock(day.lastEndIso) : day.live ? "Still live" : "—"}
          />
          <Stat
            icon={<Clock className="h-3 w-3" />}
            label="Active"
            value={formatDuration(day.activeSec)}
          />
          <Stat
            icon={<Coffee className="h-3 w-3" />}
            label="Idle"
            value={formatDuration(day.idleSec)}
          />
        </div>

        {/* Sessions */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions ({sessions.length})
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions on this day.</p>
          ) : (
            <ul className="space-y-1.5 rounded-md border border-white/10">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="font-mono tabular-nums">
                      {formatPktClock(s.started_at)}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono tabular-nums">
                      {s.ended_at ? formatPktClock(s.ended_at) : "live"}
                    </span>
                    <Badge variant="outline" className="font-mono">
                      {formatDuration(s.active_seconds ?? 0)}
                    </Badge>
                    {s.end_reason && s.end_reason !== "manual" && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-200"
                      >
                        <AlertCircle className="h-3 w-3" />
                        {s.end_reason.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Snapshots */}
        {snaps.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Camera className="h-3 w-3" /> Snapshots ({snaps.length})
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {snaps.map((s) => (
                <div
                  key={s.id}
                  className="relative overflow-hidden rounded-md border border-white/10"
                >
                  {s.signedUrl ? (
                    <img
                      src={s.signedUrl}
                      alt={s.kind}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-video bg-muted" />
                  )}
                  <div className="flex justify-between bg-black/50 px-1.5 py-0.5 text-[10px]">
                    <span className="capitalize">{s.kind}</span>
                    <span>{formatPktClock(s.captured_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ state }: { state: DayCell["state"] }) {
  switch (state) {
    case "present":
      return <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">Present</Badge>;
    case "late":
      return <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-200">Late</Badge>;
    case "very_late":
      return <Badge className="border-rose-500/30 bg-rose-500/15 text-rose-200">Very late</Badge>;
    case "absent":
      return <Badge className="border-rose-500/30 bg-rose-500/15 text-rose-200">Absent</Badge>;
    case "off":
      return <Badge variant="outline">Off day</Badge>;
    case "future":
      return <Badge variant="outline">Upcoming</Badge>;
  }
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-card/40 p-2.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
