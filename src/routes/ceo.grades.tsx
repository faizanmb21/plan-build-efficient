import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Download, Search, GraduationCap, FileSpreadsheet } from "lucide-react";
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
import { CourseGradePie, courseColor } from "@/components/grading/CourseGradePie";
import { buildGradesWorkbook, downloadGradesWorkbook } from "@/lib/grade-export";

export const Route = createFileRoute("/ceo/grades")({
  component: GradesHub,
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
  title: string;
  sections: { course_id: string; courses: { id: string; title: string } | null } | null;
}

function GradesHub() {
  const [loading, setLoading] = React.useState(true);
  const [submissions, setSubmissions] = React.useState<GradedRow[]>([]);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [franchises, setFranchises] = React.useState<Franchise[]>([]);
  const [lessonMap, setLessonMap] = React.useState<Map<string, LessonShape>>(new Map());
  const [memberRoleIds, setMemberRoleIds] = React.useState<Set<string>>(new Set());
  const [inchargeRoleIds, setInchargeRoleIds] = React.useState<Set<string>>(new Set());
  const [reviewerNames, setReviewerNames] = React.useState<Map<string, string | null>>(new Map());

  const [search, setSearch] = React.useState("");
  const [franchiseFilter, setFranchiseFilter] = React.useState<string>("all");
  const [drillMember, setDrillMember] = React.useState<Profile | null>(null);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: subs }, { data: profs }, { data: frs }, { data: roles }] = await Promise.all([
        supabase
          .from("submissions")
          .select(
            "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
          )
          .order("reviewed_at", { ascending: false, nullsFirst: false }),
        supabase.from("profiles").select("id,full_name,franchise_id"),
        supabase.from("franchises").select("id,name").is("archived_at", null),
        supabase.from("user_roles").select("user_id,role").in("role", ["member", "incharge"]),
      ]);

      const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
      const { data: lessons } = lessonIds.length
        ? await supabase
            .from("lessons")
            .select("id,title,sections(course_id,courses(id,title))")
            .in("id", lessonIds)
        : { data: [] as unknown[] };

      const lm = new Map<string, LessonShape>();
      (lessons as LessonShape[] | null | undefined)?.forEach((l) => lm.set(l.id, l));

      const memberIds = new Set<string>();
      const inchargeIds = new Set<string>();
      (roles ?? []).forEach((r) => {
        if (r.role === "member") memberIds.add(r.user_id);
        else if (r.role === "incharge") inchargeIds.add(r.user_id);
      });
      const profMap = new Map<string, string | null>();
      (profs ?? []).forEach((p) => profMap.set(p.id, p.full_name));

      setSubmissions((subs ?? []) as GradedRow[]);
      setProfiles((profs ?? []) as Profile[]);
      setFranchises((frs ?? []) as Franchise[]);
      setLessonMap(lm);
      setMemberRoleIds(memberIds);
      setInchargeRoleIds(inchargeIds);
      setReviewerNames(profMap);
      setLoading(false);
    })();
  }, []);

  const franchiseMap = React.useMemo(() => {
    const m = new Map<string, string>();
    franchises.forEach((f) => m.set(f.id, f.name));
    return m;
  }, [franchises]);

  // Group submissions by user
  const byUser = React.useMemo(() => {
    const m = new Map<string, GradedRow[]>();
    submissions.forEach((s) => {
      const arr = m.get(s.user_id) ?? [];
      arr.push(s);
      m.set(s.user_id, arr);
    });
    return m;
  }, [submissions]);

  // Member rows
  const memberRows = React.useMemo(() => {
    const members = profiles.filter((p) => memberRoleIds.has(p.id));
    return members
      .map((p) => {
        const subs = byUser.get(p.id) ?? [];
        const agg = aggregateGrades(subs);
        return {
          profile: p,
          franchise_name: p.franchise_id ? (franchiseMap.get(p.franchise_id) ?? "—") : "—",
          agg,
        };
      })
      .filter((r) => {
        if (franchiseFilter !== "all" && r.profile.franchise_id !== franchiseFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          if (!(r.profile.full_name ?? "").toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  }, [profiles, memberRoleIds, byUser, franchiseMap, franchiseFilter, search]);

  // Franchise rows
  const franchiseRows = React.useMemo(() => {
    return franchises
      .map((f) => {
        const memberIds = profiles
          .filter((p) => p.franchise_id === f.id && memberRoleIds.has(p.id))
          .map((p) => p.id);
        const subs = memberIds.flatMap((id) => byUser.get(id) ?? []);
        const agg = aggregateGrades(subs);
        return { franchise: f, members: memberIds.length, agg };
      })
      .sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  }, [franchises, profiles, memberRoleIds, byUser]);

  // Course rows
  const courseRows = React.useMemo(() => {
    const map = new Map<string, { course_title: string; rows: GradedRow[] }>();
    for (const s of submissions) {
      const l = lessonMap.get(s.lesson_id);
      const cid = l?.sections?.courses?.id;
      const ctitle = l?.sections?.courses?.title;
      if (!cid || !ctitle) continue;
      const cur = map.get(cid) ?? { course_title: ctitle, rows: [] };
      cur.rows.push(s);
      map.set(cid, cur);
    }
    return Array.from(map.entries())
      .map(([course_id, v]) => ({
        course_id,
        course_title: v.course_title,
        agg: aggregateGrades(v.rows),
      }))
      .sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  }, [submissions, lessonMap]);

  function exportMembersCsv() {
    const csv = toCsv(
      memberRows.map((r) => ({
        member: r.profile.full_name ?? "",
        franchise: r.franchise_name,
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
        { key: "franchise", label: "Franchise" },
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
    downloadCsv("grades-by-member.csv", csv);
  }

  function exportFranchisesCsv() {
    const csv = toCsv(
      franchiseRows.map((r) => ({
        franchise: r.franchise.name,
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
        { key: "franchise", label: "Franchise" },
        { key: "members", label: "Members" },
        { key: "graded", label: "Graded" },
        { key: "average_percent", label: "Avg %" },
        { key: "pass_rate", label: "Pass rate %" },
        { key: "redo_rate", label: "Redo rate %" },
        { key: "a_plus", label: "A+" },
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C" },
      ],
    );
    downloadCsv("grades-by-franchise.csv", csv);
  }

  function exportCoursesCsv() {
    const csv = toCsv(
      courseRows.map((r) => ({
        course: r.course_title,
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
        { key: "graded", label: "Graded" },
        { key: "average_percent", label: "Avg %" },
        { key: "pass_rate", label: "Pass rate %" },
        { key: "redo_rate", label: "Redo rate %" },
        { key: "a_plus", label: "A+" },
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C" },
      ],
    );
    downloadCsv("grades-by-course.csv", csv);
  }

  function exportFullReport() {
    const wb = buildGradesWorkbook({
      profiles,
      franchises,
      memberRoleIds,
      inchargeRoleIds,
      submissions,
      lessonMap,
      reviewerNames,
    });
    downloadGradesWorkbook(wb);
  }

  // Org-wide aggregate across all members
  const cohortAgg = React.useMemo(() => {
    const memberSubs = submissions.filter((s) => memberRoleIds.has(s.user_id));
    return aggregateGrades(memberSubs);
  }, [submissions, memberRoleIds]);

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
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Grading overview</h1>
          <p className="text-sm text-muted-foreground">
            Letter grades across the academy. Drill into any member, franchise, or pillar.
          </p>
        </div>
        <Button onClick={exportFullReport} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Export full report (.xlsx)
        </Button>
      </div>

      {/* Cohort overview donut */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Cohort overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <CourseGradePie
              data={courseRows.map((c, i) => ({
                name: c.course_title,
                value: c.agg.averagePercent,
                color: courseColor(i),
              }))}
              centerLabel={`${cohortAgg.averagePercent}%`}
              centerSub="overall avg"
            />
            <div className="grid grid-cols-2 gap-2 self-center">
              <Stat label="Members graded" value={String(new Set(submissions.filter(s => memberRoleIds.has(s.user_id) && s.letter_grade).map(s => s.user_id)).size)} />
              <Stat label="Total graded" value={String(cohortAgg.total)} />
              <Stat label="Pass rate" value={`${cohortAgg.passRate}%`} />
              <Stat label="Redo rate" value={`${cohortAgg.redoRate}%`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">By member</TabsTrigger>
          <TabsTrigger value="franchises">By franchise</TabsTrigger>
          <TabsTrigger value="courses">By pillar</TabsTrigger>
        </TabsList>

        {/* By member */}
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
                <Select value={franchiseFilter} onValueChange={setFranchiseFilter}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All franchises</SelectItem>
                    {franchises.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      <TableHead>Franchise</TableHead>
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
                        <TableCell className="text-muted-foreground">{r.franchise_name}</TableCell>
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
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                          No members match your filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By franchise */}
        <TabsContent value="franchises">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Franchises ({franchiseRows.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={exportFranchisesCsv}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Franchise</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Graded</TableHead>
                      <TableHead className="text-center">Distribution</TableHead>
                      <TableHead className="text-right">Avg %</TableHead>
                      <TableHead className="text-right">Pass rate</TableHead>
                      <TableHead className="text-right">Redo rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {franchiseRows.map((r) => (
                      <TableRow key={r.franchise.id}>
                        <TableCell className="font-medium">{r.franchise.name}</TableCell>
                        <TableCell className="text-right">{r.members}</TableCell>
                        <TableCell className="text-right">{r.agg.total}</TableCell>
                        <TableCell className="text-center"><Distribution agg={r.agg} /></TableCell>
                        <TableCell className="text-right font-mono">{r.agg.averagePercent}%</TableCell>
                        <TableCell className="text-right">{r.agg.passRate}%</TableCell>
                        <TableCell className="text-right">{r.agg.redoRate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By course */}
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
                        <TableCell className="text-right">{r.agg.total}</TableCell>
                        <TableCell className="text-center"><Distribution agg={r.agg} /></TableCell>
                        <TableCell className="text-right font-mono">{r.agg.averagePercent}%</TableCell>
                        <TableCell className="text-right">{r.agg.passRate}%</TableCell>
                        <TableCell className="text-right">{r.agg.redoRate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drill-down dialog */}
      <Dialog open={!!drillMember} onOpenChange={(o) => !o && setDrillMember(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {drillMember && (
            <MemberGradeReport
              userId={drillMember.id}
              fullName={drillMember.full_name}
              franchiseName={
                drillMember.franchise_id ? (franchiseMap.get(drillMember.franchise_id) ?? null) : null
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Distribution({ agg }: { agg: GradeAggregate }) {
  const total = agg.aPlus + agg.a + agg.b + agg.c;
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const seg = (count: number, color: string) =>
    count > 0 ? (
      <div
        className={color}
        style={{ width: `${(count / total) * 100}%` }}
        title={`${count}`}
      />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
