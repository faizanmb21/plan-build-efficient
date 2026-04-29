import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Printer, Download } from "lucide-react";
import {
  aggregateGrades,
  letterColorClass,
  formatRelative,
  toCsv,
  downloadCsv,
  type GradedRow,
  type GradeAggregate,
} from "@/lib/grade-utils";
import { CourseGradePie, LETTER_COLORS, courseColor } from "@/components/grading/CourseGradePie";

interface Props {
  userId: string;
  fullName: string | null;
  franchiseName: string | null;
}

interface EnrichedRow extends GradedRow {
  lesson_title: string;
  course_title: string;
  course_id: string;
  reviewer_name: string | null;
}

export function MemberGradeReport({ userId, fullName, franchiseName }: Props) {
  const [rows, setRows] = React.useState<EnrichedRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: subs } = await supabase
        .from("submissions")
        .select(
          "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
        )
        .eq("user_id", userId)
        .order("reviewed_at", { ascending: false, nullsFirst: false });

      const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
      const reviewerIds = Array.from(
        new Set((subs ?? []).map((s) => s.reviewed_by).filter(Boolean) as string[]),
      );

      const [{ data: lessons }, { data: reviewers }] = await Promise.all([
        lessonIds.length
          ? supabase
              .from("lessons")
              .select("id,title,sections(course_id,courses(id,title))")
              .in("id", lessonIds)
          : Promise.resolve({ data: [] as unknown[] }),
        reviewerIds.length
          ? supabase.from("profiles").select("id,full_name").in("id", reviewerIds)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      type LessonShape = {
        id: string;
        title: string;
        sections: { course_id: string; courses: { id: string; title: string } | null } | null;
      };
      const lessonMap = new Map<string, LessonShape>();
      (lessons as LessonShape[] | null | undefined)?.forEach((l) => lessonMap.set(l.id, l));
      const reviewerMap = new Map<string, string | null>();
      (reviewers as { id: string; full_name: string | null }[] | null | undefined)?.forEach((p) =>
        reviewerMap.set(p.id, p.full_name),
      );

      const enriched: EnrichedRow[] = (subs ?? []).map((s) => {
        const l = lessonMap.get(s.lesson_id);
        return {
          ...s,
          lesson_title: l?.title ?? "Lesson",
          course_title: l?.sections?.courses?.title ?? "—",
          course_id: l?.sections?.courses?.id ?? "",
          reviewer_name: s.reviewed_by ? (reviewerMap.get(s.reviewed_by) ?? null) : null,
        };
      });


      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const agg: GradeAggregate = React.useMemo(() => aggregateGrades(rows), [rows]);

  // Per-course breakdown
  const perCourse = React.useMemo(() => {
    const map = new Map<string, { course_title: string; rows: EnrichedRow[] }>();
    for (const r of rows) {
      if (!r.course_id) continue;
      const cur = map.get(r.course_id) ?? { course_title: r.course_title, rows: [] };
      cur.rows.push(r);
      map.set(r.course_id, cur);
    }
    return Array.from(map.entries()).map(([course_id, v]) => ({
      course_id,
      course_title: v.course_title,
      agg: aggregateGrades(v.rows),
      latest: v.rows[0]?.letter_grade ?? null,
    }));
  }, [rows]);

  function exportCsv() {
    const csv = toCsv(
      rows.map((r) => ({
        course: r.course_title,
        lesson: r.lesson_title,
        letter: r.letter_grade ?? "",
        percent: r.grade ?? "",
        status: r.status,
        feedback: r.feedback ?? "",
        reviewer: r.reviewer_name ?? "",
        graded_at: r.reviewed_at ?? "",
        submitted_at: r.created_at,
      })),
      [
        { key: "course", label: "Course" },
        { key: "lesson", label: "Lesson" },
        { key: "letter", label: "Letter" },
        { key: "percent", label: "Percent" },
        { key: "status", label: "Status" },
        { key: "feedback", label: "Feedback" },
        { key: "reviewer", label: "Reviewer" },
        { key: "graded_at", label: "Graded at" },
        { key: "submitted_at", label: "Submitted at" },
      ],
    );
    downloadCsv(`grades-${(fullName ?? "member").replace(/\s+/g, "-")}.csv`, csv);
  }

  function openPrintable() {
    window.open(`/ceo/grades/report?member=${userId}`, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{fullName ?? "Member"}</h2>
          <p className="text-sm text-muted-foreground">
            {franchiseName ?? "No franchise"} · {agg.total} graded · avg {agg.averagePercent}%
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={openPrintable}>
            <Printer className="h-4 w-4" /> Printable report
          </Button>
        </div>
      </div>

      {/* Distribution tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <DistTile label="A+" count={agg.aPlus} className="text-emerald-300" />
        <DistTile label="A" count={agg.a} className="text-sky-300" />
        <DistTile label="B" count={agg.b} className="text-amber-300" />
        <DistTile label="C / Redo" count={agg.c} className="text-rose-300" />
        <DistTile label="Pending" count={agg.pending} className="text-muted-foreground" />
      </div>

      {/* Donut visualisations */}
      {(agg.total > 0 || perCourse.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Letter distribution
              </div>
              <CourseGradePie
                data={[
                  { name: "A+", value: agg.aPlus, color: LETTER_COLORS["A+"] },
                  { name: "A", value: agg.a, color: LETTER_COLORS["A"] },
                  { name: "B", value: agg.b, color: LETTER_COLORS["B"] },
                  { name: "C / Redo", value: agg.c, color: LETTER_COLORS["C"] },
                ]}
                centerLabel={`${agg.averagePercent}%`}
                centerSub="overall avg"
              />
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Average % by course
              </div>
              <CourseGradePie
                data={perCourse.map((c, i) => ({
                  name: c.course_title,
                  value: c.agg.averagePercent,
                  color: courseColor(i),
                }))}
                centerLabel={`${perCourse.length}`}
                centerSub="courses graded"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-course breakdown */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Per-course breakdown</h3>
        {perCourse.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No graded courses yet.</CardContent></Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {perCourse.map((c) => (
              <Card key={c.course_id} className="bg-white/5 border-white/10">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.course_title}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.agg.total} graded · avg {c.agg.averagePercent}% · pass {c.agg.passRate}%
                    </div>
                  </div>
                  {c.latest && (
                    <Badge variant="outline" className={letterColorClass(c.latest)}>
                      Latest: {c.latest}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Submission timeline */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Submission history</h3>
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {rows.map((r) => (
            <Card key={r.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.lesson_title}</div>
                    <div className="text-xs text-muted-foreground">{r.course_title}</div>
                  </div>
                  <Badge variant="outline" className={letterColorClass(r.letter_grade)}>
                    {r.letter_grade ?? r.status}
                  </Badge>
                </div>
                {r.feedback && (
                  <p className="text-xs text-muted-foreground italic">"{r.feedback}"</p>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {r.reviewer_name ? `Graded by ${r.reviewer_name}` : "Awaiting review"} ·{" "}
                  {formatRelative(r.reviewed_at ?? r.created_at)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function DistTile({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-3 text-center">
        <div className={`text-xl font-bold ${className ?? ""}`}>{count}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
