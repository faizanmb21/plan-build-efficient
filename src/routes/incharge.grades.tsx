import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Download, Search, GraduationCap, ClipboardList } from "lucide-react";
import {
  aggregateGrades,
  toCsv,
  downloadCsv,
  formatRelative,
  letterColorClass,
  type GradedRow,
  type GradeAggregate,
} from "@/lib/grade-utils";
import { MemberGradeReport } from "@/components/MemberGradeReport";

export const Route = createFileRoute("/incharge/grades")({
  component: InchargeGradesHub,
});

interface Profile {
  id: string;
  full_name: string | null;
  franchise_id: string | null;
}
interface Franchise {
  id: string;
  name: string;
}
interface LessonShape {
  id: string;
  sections: { course_id: string; courses: { id: string; title: string } | null } | null;
}

function InchargeGradesHub() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [submissions, setSubmissions] = React.useState<GradedRow[]>([]);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [franchise, setFranchise] = React.useState<Franchise | null>(null);
  const [lessonMap, setLessonMap] = React.useState<Map<string, LessonShape>>(new Map());

  const [search, setSearch] = React.useState("");
  const [drillMember, setDrillMember] = React.useState<Profile | null>(null);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Resolve incharge's franchise
      const { data: franchiseId } = await supabase.rpc("get_user_franchise", {
        _user_id: user.id,
      });
      if (!franchiseId) {
        setLoading(false);
        return;
      }

      const [{ data: fr }, { data: profs }] = await Promise.all([
        supabase.from("franchises").select("id,name").eq("id", franchiseId).maybeSingle(),
        supabase
          .from("profiles")
          .select("id,full_name,franchise_id")
          .eq("franchise_id", franchiseId),
      ]);

      const profIds = (profs ?? []).map((p) => p.id);
      const { data: subs } = profIds.length
        ? await supabase
            .from("submissions")
            .select(
              "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
            )
            .in("user_id", profIds)
            .order("reviewed_at", { ascending: false, nullsFirst: false })
        : { data: [] as GradedRow[] };

      const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
      const { data: lessons } = lessonIds.length
        ? await supabase
            .from("lessons")
            .select("id,sections(course_id,courses(id,title))")
            .in("id", lessonIds)
        : { data: [] as unknown[] };

      const lm = new Map<string, LessonShape>();
      (lessons as LessonShape[] | null | undefined)?.forEach((l) => lm.set(l.id, l));

      setFranchise((fr ?? null) as Franchise | null);
      setProfiles((profs ?? []) as Profile[]);
      setSubmissions((subs ?? []) as GradedRow[]);
      setLessonMap(lm);
      setLoading(false);
    })();
  }, [user]);

  const byUser = React.useMemo(() => {
    const m = new Map<string, GradedRow[]>();
    submissions.forEach((s) => {
      const arr = m.get(s.user_id) ?? [];
      arr.push(s);
      m.set(s.user_id, arr);
    });
    return m;
  }, [submissions]);

  const memberRows = React.useMemo(() => {
    // Treat every profile in the franchise (other than the incharge themselves) as a member.
    // We can't filter by user_roles here because RLS only lets the incharge read their OWN role.
    const members = profiles.filter((p) => p.id !== user?.id);
    return members
      .map((p) => {
        const subs = byUser.get(p.id) ?? [];
        const agg = aggregateGrades(subs);
        return { profile: p, agg };
      })
      .filter((r) => {
        if (search.trim()) {
          const q = search.toLowerCase();
          if (!(r.profile.full_name ?? "").toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  }, [profiles, user?.id, byUser, search]);

  const courseRows = React.useMemo(() => {
    const map = new Map<
      string,
      { course_title: string; rows: GradedRow[]; userIds: Set<string> }
    >();
    for (const s of submissions) {
      const l = lessonMap.get(s.lesson_id);
      const cid = l?.sections?.courses?.id;
      const ctitle = l?.sections?.courses?.title;
      if (!cid || !ctitle) continue;
      const cur = map.get(cid) ?? { course_title: ctitle, rows: [], userIds: new Set<string>() };
      cur.rows.push(s);
      cur.userIds.add(s.user_id);
      map.set(cid, cur);
    }
    return Array.from(map.entries())
      .map(([course_id, v]) => ({
        course_id,
        course_title: v.course_title,
        members: v.userIds.size,
        agg: aggregateGrades(v.rows),
      }))
      .sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  }, [submissions, lessonMap]);

  const totals = React.useMemo(() => {
    const overall = aggregateGrades(submissions);
    const totalMembers = profiles.filter((p) => p.id !== user?.id).length;
    return { ...overall, totalMembers };
  }, [submissions, profiles, user?.id]);

  function exportMembersCsv() {
    const csv = toCsv(
      memberRows.map((r) => ({
        member: r.profile.full_name ?? "",
        graded: r.agg.total,
        a_plus: r.agg.aPlus,
        a: r.agg.a,
        b: r.agg.b,
        c: r.agg.c,
        pending: r.agg.pending,
        average_percent: r.agg.averagePercent,
        pass_rate: r.agg.passRate,
        last_graded: r.agg.lastGradedAt ?? "",
      })),
      [
        { key: "member", label: "Member" },
        { key: "graded", label: "Graded" },
        { key: "a_plus", label: "A+" },
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C / Redo" },
        { key: "pending", label: "Pending" },
        { key: "average_percent", label: "Avg %" },
        { key: "pass_rate", label: "Pass rate %" },
        { key: "last_graded", label: "Last graded" },
      ],
    );
    downloadCsv(`grades-${franchise?.name ?? "franchise"}-by-member.csv`, csv);
  }

  function exportCoursesCsv() {
    const csv = toCsv(
      courseRows.map((r) => ({
        course: r.course_title,
        members: r.members,
        graded: r.agg.total,
        average_percent: r.agg.averagePercent,
        pass_rate: r.agg.passRate,
        redo_rate: r.agg.redoRate,
        a_plus: r.agg.aPlus,
        a: r.agg.a,
        b: r.agg.b,
        c: r.agg.c,
      })),
      [
        { key: "course", label: "Course / Pillar" },
        { key: "members", label: "Members graded" },
        { key: "graded", label: "Submissions" },
        { key: "average_percent", label: "Avg %" },
        { key: "pass_rate", label: "Pass rate %" },
        { key: "redo_rate", label: "Redo rate %" },
        { key: "a_plus", label: "A+" },
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C" },
      ],
    );
    downloadCsv(`grades-${franchise?.name ?? "franchise"}-by-course.csv`, csv);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Grading overview</h1>
          <p className="text-sm text-muted-foreground">
            {franchise?.name ?? "Your franchise"} — letter grades across your members and pillars.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Members" value={totals.totalMembers} />
        <SummaryTile label="Graded" value={totals.total} />
        <SummaryTile label="Average %" value={`${totals.averagePercent}%`} />
        <Link to="/incharge/reviews" className="contents">
          <SummaryTile
            label="Pending review"
            value={totals.pending}
            icon={ClipboardList}
            highlight={totals.pending > 0}
          />
        </Link>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">By member</TabsTrigger>
          <TabsTrigger value="courses">By pillar</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Members ({memberRows.length})</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search member"
                    className="h-9 w-48 pl-8"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={exportMembersCsv}>
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead className="text-right">Graded</TableHead>
                      <TableHead className="text-center">Distribution</TableHead>
                      <TableHead className="text-right">Avg %</TableHead>
                      <TableHead className="text-right">Last graded</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberRows.map((r) => (
                      <TableRow key={r.profile.id}>
                        <TableCell className="font-medium">{r.profile.full_name ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.agg.total}</TableCell>
                        <TableCell className="text-center">
                          <Distribution agg={r.agg} />
                        </TableCell>
                        <TableCell className="text-right font-mono">{r.agg.averagePercent}%</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatRelative(r.agg.lastGradedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setDrillMember(r.profile)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {memberRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                          No members in your franchise yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="courses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Courses / Pillars ({courseRows.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={exportCoursesCsv}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Graded</TableHead>
                      <TableHead className="text-center">Distribution</TableHead>
                      <TableHead className="text-right">Avg %</TableHead>
                      <TableHead className="text-right">Pass rate</TableHead>
                      <TableHead className="text-right">Redo rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courseRows.map((r) => (
                      <TableRow key={r.course_id}>
                        <TableCell className="font-medium">{r.course_title}</TableCell>
                        <TableCell className="text-right">{r.members}</TableCell>
                        <TableCell className="text-right">{r.agg.total}</TableCell>
                        <TableCell className="text-center"><Distribution agg={r.agg} /></TableCell>
                        <TableCell className="text-right font-mono">{r.agg.averagePercent}%</TableCell>
                        <TableCell className="text-right">{r.agg.passRate}%</TableCell>
                        <TableCell className="text-right">{r.agg.redoRate}%</TableCell>
                      </TableRow>
                    ))}
                    {courseRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                          No graded submissions yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!drillMember} onOpenChange={(o) => !o && setDrillMember(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {drillMember && (
            <MemberGradeReport
              userId={drillMember.id}
              fullName={drillMember.full_name}
              franchiseName={franchise?.name ?? null}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/40" : ""}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
        {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
      </CardContent>
    </Card>
  );
}

function Distribution({ agg }: { agg: GradeAggregate }) {
  const total = agg.aPlus + agg.a + agg.b + agg.c;
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const seg = (count: number, color: string) =>
    count > 0 ? (
      <div className={color} style={{ width: `${(count / total) * 100}%` }} title={`${count}`} />
    ) : null;
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex h-2 w-32 overflow-hidden rounded-full bg-white/5">
        {seg(agg.aPlus, "bg-emerald-500")}
        {seg(agg.a, "bg-sky-500")}
        {seg(agg.b, "bg-amber-500")}
        {seg(agg.c, "bg-rose-500")}
      </div>
      <div className="flex gap-1 text-[10px]">
        <Badge variant="outline" className={letterColorClass("A+")}>{agg.aPlus}</Badge>
        <Badge variant="outline" className={letterColorClass("A")}>{agg.a}</Badge>
        <Badge variant="outline" className={letterColorClass("B")}>{agg.b}</Badge>
        <Badge variant="outline" className={letterColorClass("C")}>{agg.c}</Badge>
      </div>
    </div>
  );
}
