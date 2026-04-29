import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Building2,
  Users,
  Phone,
  Trash2,
  ShieldCheck,
  BookOpen,
  CheckCircle2,
  Clock,
  Activity,
  Camera,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { GradePieCard } from "@/components/grading/GradePieCard";
import { fetchGradeSummaries, combineAggregates } from "@/lib/grade-summary";
import { emptyAggregate, type GradeAggregate } from "@/lib/grade-utils";
import { MemberGradeReport } from "@/components/MemberGradeReport";
import { GraduationCap } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/ceo/franchises/$id")({
  component: FranchiseDetailPage,
});

interface Franchise {
  id: string;
  name: string;
  location: string | null;
  manager_id: string | null;
  created_at: string;
  archived_at: string | null;
}

interface MemberStats {
  coursesStarted: number;
  coursesCompleted: number;
  lastActive: string | null;
  activeToday: number;
  activeWeek: number;
  liveNow: boolean;
  snapsToday: number;
  lastSeen: string | null;
}

interface MemberDetail {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: "ceo" | "incharge" | "member" | undefined;
  gradeAgg: GradeAggregate;
  stats: MemberStats;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function FranchiseDetailPage() {
  const { id } = Route.useParams();
  const [franchise, setFranchise] = React.useState<Franchise | null>(null);
  const [manager, setManager] = React.useState<MemberDetail | null>(null);
  const [members, setMembers] = React.useState<MemberDetail[]>([]);
  const [orgAgg, setOrgAgg] = React.useState<GradeAggregate>(emptyAggregate());
  const [loading, setLoading] = React.useState(true);
  const [snapMember, setSnapMember] = React.useState<MemberDetail | null>(null);
  const [gradeMember, setGradeMember] = React.useState<MemberDetail | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    // 1. Franchise + people in one parallel batch
    const [{ data: f }, { data: profs }, { data: roles }] = await Promise.all([
      supabase.from("franchises").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, franchise_id")
        .eq("franchise_id", id),
      supabase.from("user_roles").select("user_id, role").eq("franchise_id", id),
    ]);

    setFranchise((f as Franchise | null) ?? null);

    const roleMap = new Map<string, "ceo" | "incharge" | "member">();
    ((roles as { user_id: string; role: "ceo" | "incharge" | "member" }[]) ?? []).forEach((r) =>
      roleMap.set(r.user_id, r.role),
    );

    const profileRows =
      (profs as {
        id: string;
        full_name: string | null;
        phone: string | null;
        avatar_url: string | null;
      }[] | null) ?? [];
    const memberIds = profileRows.filter((p) => roleMap.get(p.id) === "member").map((p) => p.id);

    // 2. All published courses + their lessons (used for "Started/Done" tiles)
    const { data: coursesData } = await supabase
      .from("courses")
      .select("id")
      .eq("status", "published");
    const courseIds = ((coursesData as { id: string }[] | null) ?? []).map(
      (c) => c.id,
    );

    const lessonsByCourse = new Map<string, string[]>();
    let allLessonIds: string[] = [];
    if (courseIds.length > 0) {
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id, sections!inner(course_id)")
        .in("sections.course_id", courseIds);
      ((lessons as unknown as { id: string; sections: { course_id: string } | null }[] | null) ??
        []).forEach((l) => {
        const cid = l.sections?.course_id;
        if (!cid) return;
        const arr = lessonsByCourse.get(cid) ?? [];
        arr.push(l.id);
        lessonsByCourse.set(cid, arr);
      });
      allLessonIds = Array.from(lessonsByCourse.values()).flat();
    }

    // 3. Lesson progress + sessions + snapshots + grade summaries (parallel)
    const completedByUser = new Map<string, Set<string>>();
    const lastActiveByUser = new Map<string, string>();
    const activeTodayByUser = new Map<string, number>();
    const activeWeekByUser = new Map<string, number>();
    const liveNowByUser = new Set<string>();
    const lastSeenByUser = new Map<string, string>();
    const snapsTodayByUser = new Map<string, number>();
    let aggsByUser = new Map<string, GradeAggregate>();

    if (memberIds.length > 0) {
      const [progressRes, sessionsRes, snapsRes, gradeMap] = await Promise.all([
        allLessonIds.length > 0
          ? supabase
              .from("lesson_progress")
              .select("user_id, lesson_id, completed, completed_at, updated_at")
              .in("user_id", memberIds)
              .in("lesson_id", allLessonIds)
          : Promise.resolve({ data: [] as never[] }),
        supabase
          .from("study_sessions")
          .select("user_id, started_at, ended_at, active_seconds, last_heartbeat_at")
          .in("user_id", memberIds)
          .gte("started_at", weekStart.toISOString()),
        supabase
          .from("attendance_snapshots")
          .select("user_id", { count: "exact" })
          .in("user_id", memberIds)
          .gte("captured_at", dayStart.toISOString()),
        fetchGradeSummaries(memberIds),
      ]);
      aggsByUser = gradeMap;

      (progressRes.data ?? []).forEach((p) => {
        const ts = p.completed_at ?? p.updated_at;
        if (ts) {
          const prev = lastActiveByUser.get(p.user_id);
          if (!prev || new Date(ts) > new Date(prev)) lastActiveByUser.set(p.user_id, ts);
        }
        if (!p.completed) return;
        const set = completedByUser.get(p.user_id) ?? new Set<string>();
        set.add(p.lesson_id);
        completedByUser.set(p.user_id, set);
      });

      const dayStartMs = dayStart.getTime();
      (sessionsRes.data ?? []).forEach((s) => {
        const startedMs = new Date(s.started_at).getTime();
        const sec = s.active_seconds ?? 0;
        activeWeekByUser.set(s.user_id, (activeWeekByUser.get(s.user_id) ?? 0) + sec);
        if (startedMs >= dayStartMs) {
          activeTodayByUser.set(s.user_id, (activeTodayByUser.get(s.user_id) ?? 0) + sec);
        }
        if (!s.ended_at) liveNowByUser.add(s.user_id);
        const seen = s.last_heartbeat_at ?? s.started_at;
        const prev = lastSeenByUser.get(s.user_id);
        if (!prev || new Date(seen) > new Date(prev)) lastSeenByUser.set(s.user_id, seen);
      });

      (snapsRes.data ?? []).forEach((row) => {
        snapsTodayByUser.set(row.user_id, (snapsTodayByUser.get(row.user_id) ?? 0) + 1);
      });
    }

    // 4. Compute per-member activity stats
    function statsForUser(uid: string): MemberStats {
      const done = completedByUser.get(uid) ?? new Set<string>();
      let started = 0;
      let completed = 0;
      courseIds.forEach((cid) => {
        const lids = lessonsByCourse.get(cid) ?? [];
        if (lids.length === 0) return;
        const doneCount = lids.filter((lid) => done.has(lid)).length;
        if (doneCount > 0) started += 1;
        if (doneCount === lids.length) completed += 1;
      });
      return {
        coursesStarted: started,
        coursesCompleted: completed,
        lastActive: lastActiveByUser.get(uid) ?? null,
        activeToday: activeTodayByUser.get(uid) ?? 0,
        activeWeek: activeWeekByUser.get(uid) ?? 0,
        liveNow: liveNowByUser.has(uid),
        snapsToday: snapsTodayByUser.get(uid) ?? 0,
        lastSeen: lastSeenByUser.get(uid) ?? null,
      };
    }

    const mList: MemberDetail[] = profileRows.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      avatar_url: p.avatar_url,
      role: roleMap.get(p.id),
      gradeAgg: aggsByUser.get(p.id) ?? emptyAggregate(),
      stats: statsForUser(p.id),
    }));

    const inchargeId =
      (f as Franchise | null)?.manager_id ??
      mList.find((m) => m.role === "incharge")?.id ??
      null;
    setManager(mList.find((m) => m.id === inchargeId) ?? null);
    const onlyMembers = mList.filter((m) => m.role === "member");
    setMembers(onlyMembers);

    setOrgAgg(combineAggregates(onlyMembers.map((m) => m.gradeAgg)));
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const confirm = useConfirm();
  async function removeMember(uid: string, name: string) {
    const ok = await confirm({
      title: "Remove member?",
      description: `Remove ${name || "this member"} from the franchise?`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("remove_member_from_franchise", { _user_id: uid });
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    load();
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading franchise…</div>;
  }
  if (!franchise) {
    return (
      <div className="space-y-3">
        <Link to="/ceo/franchises">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to franchises
          </Button>
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Franchise not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/ceo/franchises">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to franchises
          </Button>
        </Link>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-accent" />
            <h1 className="font-display text-2xl font-bold tracking-tight">{franchise.name}</h1>
            {franchise.archived_at && <Badge variant="destructive">Archived</Badge>}
          </div>
          {franchise.location && (
            <p className="mt-1 text-sm text-muted-foreground">{franchise.location}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {members.length} member{members.length === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />{" "}
              {manager ? `Incharge: ${manager.full_name ?? "Unnamed"}` : "No incharge assigned"}
            </span>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Franchise mastery</CardTitle>
          <CardDescription>
            12-pillar progress averaged across this franchise's members.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <PillarFlower scores={orgScores} size={320} showLegend />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No members in this franchise yet. Send an invite to add one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <Card key={m.id} className="hover-lift">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.full_name ?? ""} />}
                        <AvatarFallback>
                          {(m.full_name ?? "?").slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {m.full_name ?? "Unnamed"}
                        </CardTitle>
                        {m.phone && (
                          <CardDescription className="flex items-center gap-1.5 text-xs">
                            <Phone className="h-3 w-3" /> {m.phone}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="capitalize">
                        {m.role ?? "member"}
                      </Badge>
                      {m.stats.liveNow && (
                        <Badge className="gap-1">
                          <Radio className="h-3 w-3 animate-pulse" /> Live
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-center">
                    <PillarFlower scores={m.scores} size={150} showLabels={false} />
                  </div>

                  {/* Course progress */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatTile icon={BookOpen} label="Started" value={String(m.stats.coursesStarted)} />
                    <StatTile
                      icon={CheckCircle2}
                      label="Done"
                      value={String(m.stats.coursesCompleted)}
                    />
                    <StatTile
                      icon={Clock}
                      label="Active"
                      value={formatRelative(m.stats.lastActive)}
                      small
                    />
                  </div>

                  {/* Attendance */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatTile
                      icon={Activity}
                      label="Today"
                      value={fmtTime(m.stats.activeToday)}
                      small
                    />
                    <StatTile
                      icon={Activity}
                      label="7 days"
                      value={fmtTime(m.stats.activeWeek)}
                      small
                    />
                    <StatTile
                      icon={Camera}
                      label="Snaps"
                      value={String(m.stats.snapsToday)}
                      small
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setGradeMember(m)}
                    >
                      <GraduationCap className="h-3.5 w-3.5" /> Grades
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSnapMember(m)}
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeMember(m.id, m.full_name ?? "")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <SnapshotDialog member={snapMember} onClose={() => setSnapMember(null)} />

      <Dialog open={!!gradeMember} onOpenChange={(o) => !o && setGradeMember(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {gradeMember && (
            <MemberGradeReport
              userId={gradeMember.id}
              fullName={gradeMember.full_name}
              franchiseName={franchise?.name ?? null}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-0.5 font-semibold ${small ? "text-xs" : "text-sm"}`}>{value}</div>
    </div>
  );
}

function SnapshotDialog({
  member,
  onClose,
}: {
  member: MemberDetail | null;
  onClose: () => void;
}) {
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
        .eq("user_id", member.id)
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
          <DialogDescription>Webcam, screen, and manual check-in photos.</DialogDescription>
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

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours <= 0) return "Just now";
    return `${hours}h ago`;
  }
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1mo ago";
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
