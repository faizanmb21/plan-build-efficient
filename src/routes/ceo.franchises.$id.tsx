import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "sonner";
import { PillarFlower } from "@/components/PillarFlower";
import { PILLARS, type PillarScores } from "@/lib/pillars";

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
}

interface MemberDetail {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: "ceo" | "incharge" | "member" | undefined;
  scores: PillarScores;
  stats: MemberStats;
}

const EMPTY_SCORES: PillarScores = PILLARS.map(() => 0) as PillarScores;

function FranchiseDetailPage() {
  const { id } = Route.useParams();
  const [franchise, setFranchise] = React.useState<Franchise | null>(null);
  const [manager, setManager] = React.useState<MemberDetail | null>(null);
  const [members, setMembers] = React.useState<MemberDetail[]>([]);
  const [orgScores, setOrgScores] = React.useState<PillarScores>(EMPTY_SCORES);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);

    // 1. Franchise + people in one parallel batch
    const [{ data: f }, { data: profs }, { data: roles }] = await Promise.all([
      supabase.from("franchises").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("id, full_name, phone, franchise_id").eq("franchise_id", id),
      supabase.from("user_roles").select("user_id, role").eq("franchise_id", id),
    ]);

    setFranchise((f as Franchise | null) ?? null);

    const roleMap = new Map<string, "ceo" | "incharge" | "member">();
    ((roles as { user_id: string; role: "ceo" | "incharge" | "member" }[]) ?? []).forEach((r) =>
      roleMap.set(r.user_id, r.role),
    );

    const profileRows =
      (profs as { id: string; full_name: string | null; phone: string | null }[] | null) ?? [];
    const memberIds = profileRows.filter((p) => roleMap.get(p.id) === "member").map((p) => p.id);

    // 2. Resolve the 12 pillar courses + their lessons in one query each
    const titles = PILLARS.map((p) => p.title);
    const { data: coursesData } = await supabase
      .from("courses")
      .select("id, title")
      .in("title", titles);
    const courseList = (coursesData as { id: string; title: string }[] | null) ?? [];
    const courseIdByPillar = PILLARS.map(
      (p) => courseList.find((c) => c.title === p.title)?.id,
    );
    const courseIds = courseIdByPillar.filter((x): x is string => Boolean(x));

    let lessonsByCourse = new Map<string, string[]>();
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

    // 3. ONE query for all completed lesson_progress across all members in this franchise
    const completedByUser = new Map<string, Set<string>>();
    const lastActiveByUser = new Map<string, string>();
    if (memberIds.length > 0 && allLessonIds.length > 0) {
      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("user_id, lesson_id, completed, completed_at, updated_at")
        .in("user_id", memberIds)
        .in("lesson_id", allLessonIds);

      (progress ?? []).forEach((p) => {
        // Track last activity from any progress row (completed or not)
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
    }

    // 4. Compute per-member scores + activity stats in-memory
    function scoresForUser(uid: string): PillarScores {
      const done = completedByUser.get(uid) ?? new Set<string>();
      return PILLARS.map((_, idx) => {
        const cid = courseIdByPillar[idx];
        if (!cid) return 0;
        const lids = lessonsByCourse.get(cid) ?? [];
        if (lids.length === 0) return 0;
        const completed = lids.filter((lid) => done.has(lid)).length;
        return completed / lids.length;
      }) as PillarScores;
    }
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
      };
    }

    const mList: MemberDetail[] = profileRows.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      role: roleMap.get(p.id),
      scores: scoresForUser(p.id),
      stats: statsForUser(p.id),
    }));

    const inchargeId =
      (f as Franchise | null)?.manager_id ??
      mList.find((m) => m.role === "incharge")?.id ??
      null;
    setManager(mList.find((m) => m.id === inchargeId) ?? null);
    const onlyMembers = mList.filter((m) => m.role === "member");
    setMembers(onlyMembers);

    // Org-level pillar scores: average across members
    if (onlyMembers.length === 0) {
      setOrgScores(EMPTY_SCORES);
    } else {
      const summed = PILLARS.map((_, idx) => {
        const sum = onlyMembers.reduce((acc, m) => acc + (m.scores[idx] ?? 0), 0);
        return sum / onlyMembers.length;
      }) as PillarScores;
      setOrgScores(summed);
    }
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function removeMember(uid: string, name: string) {
    if (!confirm(`Remove ${name || "this member"} from the franchise?`)) return;
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
                    <CardTitle className="text-base">{m.full_name ?? "Unnamed"}</CardTitle>
                    <Badge variant="outline" className="capitalize">
                      {m.role ?? "member"}
                    </Badge>
                  </div>
                  {m.phone && (
                    <CardDescription className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {m.phone}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-center">
                    <PillarFlower scores={m.scores} size={150} showLabels={false} />
                  </div>

                  {/* Activity stats */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <BookOpen className="h-3 w-3" /> Started
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">{m.stats.coursesStarted}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">{m.stats.coursesCompleted}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Clock className="h-3 w-3" /> Active
                      </div>
                      <div className="mt-0.5 text-xs font-semibold">
                        {formatRelative(m.stats.lastActive)}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => removeMember(m.id, m.full_name ?? "")}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove from franchise
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
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
