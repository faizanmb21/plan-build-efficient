import * as React from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format-duration";
import type { LiveMember } from "@/lib/live-board";

function ringColor(pct: number): string {
  return pct >= 70 ? "#34d399" : pct >= 45 ? "#fbbf24" : "#fb7185";
}
function ringTextClass(pct: number): string {
  return pct >= 70 ? "text-emerald-300" : pct >= 45 ? "text-amber-300" : "text-rose-300";
}

function ProgressRingAvatar({ pct, initials }: { pct: number; initials: string }) {
  const R = 20;
  const C = 2 * Math.PI * R;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * C;
  const color = ringColor(pct);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
        <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-semibold">{initials}</span>
      </div>
    </div>
  );
}

function elapsedHM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function MiniTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "emerald" | "amber" | "rose" | "sky" | "neutral";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "rose"
          ? "text-rose-300"
          : tone === "sky"
            ? "text-sky-300"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-semibold tabular-nums leading-none", cls)}>{value}</p>
    </div>
  );
}

export function MemberLiveCard({ member }: { member: LiveMember }) {
  const m = member;
  const hoursPct = m.weekTargetSec > 0 ? Math.round((m.hoursWeekSec / m.weekTargetSec) * 100) : 0;

  return (
    <Link
      to="/ceo/members/$userId"
      params={{ userId: m.userId }}
      className={cn(
        "block rounded-xl border p-3.5 transition-colors hover:border-primary/40",
        m.atRisk
          ? "border-rose-500/40 bg-rose-500/[0.03]"
          : "border-white/8 bg-white/[0.02]",
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <ProgressRingAvatar pct={m.overallPct} initials={m.initials} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{m.fullName}</p>
            <span className={cn("shrink-0 text-xs font-bold tabular-nums", ringTextClass(m.overallPct))}>
              {m.overallPct}%
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {m.status === "live" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                LIVE
                {m.currentLessonTitle && (
                  <span className="max-w-[120px] truncate font-normal opacity-80">
                    · {m.currentLessonTitle}
                  </span>
                )}
                {m.liveElapsedSec != null && (
                  <span className="font-mono opacity-80">· {elapsedHM(m.liveElapsedSec)}</span>
                )}
              </span>
            )}
            {m.status === "offline" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                offline
                {m.lastEndPkt && <span className="opacity-80">· last seen {m.lastEndPkt}</span>}
              </span>
            )}
            {m.status === "off_day" && (
              <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                off day
              </span>
            )}
            {m.lateInPkt && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                started {m.lateInPkt} · late
              </span>
            )}
            {m.atRisk && (
              <span
                className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300"
                title={m.riskReasons.join(" · ")}
              >
                ⚠ AT RISK
              </span>
            )}
          </div>

          {/* Scheduled vs actual start — the ask was specifically to surface
              this for offline members so the CEO can cross-check who was
              supposed to be working and either never showed or ran late. */}
          {m.status === "offline" && (
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              {m.actualStartPkt
                ? `Started ${m.actualStartPkt} · scheduled ${m.scheduledStartPkt}`
                : `Hasn't started today · scheduled ${m.scheduledStartPkt}`}
            </p>
          )}
        </div>
      </div>

      {/* KPI mini-tiles */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <MiniTile
          label="Overall"
          value={`${m.overallPct}%`}
          tone={m.overallPct >= 70 ? "emerald" : m.overallPct >= 45 ? "amber" : "rose"}
        />
        <MiniTile
          label="Hrs/wk"
          value={formatDuration(m.hoursWeekSec)}
          tone={hoursPct >= 100 ? "emerald" : hoursPct >= 60 ? "amber" : "rose"}
        />
        <MiniTile
          label="Attend"
          value={`${m.attendPct}%`}
          tone={m.attendPct >= 85 ? "emerald" : m.attendPct >= 70 ? "amber" : "rose"}
        />
        <MiniTile
          label="Avg grade"
          value={m.gradeLetter ? `${m.gradeLetter}` : "—"}
          tone={
            m.gradeAvgPct == null
              ? "neutral"
              : m.gradeAvgPct >= 85
                ? "emerald"
                : m.gradeAvgPct >= 70
                  ? "amber"
                  : "rose"
          }
        />
      </div>
    </Link>
  );
}
