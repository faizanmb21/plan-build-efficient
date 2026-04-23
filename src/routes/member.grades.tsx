import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCcw, CheckCircle2, Award } from "lucide-react";
import { letterColorClass } from "@/lib/grade-utils";

export const Route = createFileRoute("/member/grades")({
  component: GradesPage,
});

interface ProjectGradeRow {
  id: string;
  project_id: string;
  project_title: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface GradeRow {
  id: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  lesson_id: string;
  lesson_title: string;
  course_title: string;
  course_id: string | null;
}

function GradesPage() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<GradeRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: subs } = await supabase
      .from("submissions")
      .select(
        "id,status,letter_grade,grade,feedback,created_at,reviewed_at,lesson_id",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
    const { data: lessons } = lessonIds.length
      ? await supabase
          .from("lessons")
          .select("id,title,section_id,sections(course_id,courses(title))")
          .in("id", lessonIds)
      : { data: [] as any[] };

    const lessonMap = new Map<
      string,
      { title: string; courseTitle: string; courseId: string | null }
    >();
    (lessons ?? []).forEach((l: any) => {
      lessonMap.set(l.id, {
        title: l.title,
        courseTitle: l.sections?.courses?.title ?? "Course",
        courseId: l.sections?.course_id ?? null,
      });
    });

    const enriched: GradeRow[] = (subs ?? []).map((s: any) => ({
      ...s,
      lesson_title: lessonMap.get(s.lesson_id)?.title ?? "Lesson",
      course_title: lessonMap.get(s.lesson_id)?.courseTitle ?? "Course",
      course_id: lessonMap.get(s.lesson_id)?.courseId ?? null,
    }));
    setRows(enriched);
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  const passed = rows.filter((r) => r.status === "approved");
  const redo = rows.filter((r) => r.status === "revision");
  const pending = rows.filter((r) => r.status === "pending");

  const avg =
    passed.length > 0
      ? Math.round(
          passed.reduce((s, r) => s + (r.grade ?? 0), 0) / passed.length,
        )
      : null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My grades</h1>
          <p className="text-sm text-muted-foreground">
            Letter grades and feedback from your franchise incharge.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Passed" value={passed.length} icon={CheckCircle2} />
        <SummaryCard label="Redo" value={redo.length} />
        <SummaryCard label="Pending" value={pending.length} />
        <SummaryCard label="Avg %" value={avg ?? "—"} icon={Award} />
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading grades…
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No submissions yet</CardTitle>
            <CardDescription>
              Submit a practical from any course to start earning grades.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <GradeCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function GradeCard({ row }: { row: GradeRow }) {
  const isPass = row.status === "approved";
  const isRedo = row.status === "revision";
  const isPending = row.status === "pending";
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.lesson_title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.course_title} ·{" "}
              {row.reviewed_at
                ? `Graded ${new Date(row.reviewed_at).toLocaleDateString()}`
                : `Submitted ${new Date(row.created_at).toLocaleDateString()}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {row.letter_grade && (
              <Badge
                variant="outline"
                className={`font-mono text-base ${
                  isRedo ? "border-destructive text-destructive" : ""
                }`}
              >
                {row.letter_grade}
              </Badge>
            )}
            {isPass && (
              <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                Passed
              </Badge>
            )}
            {isRedo && (
              <Badge variant="destructive">Redo required</Badge>
            )}
            {isPending && <Badge variant="secondary">Pending</Badge>}
          </div>
        </div>
        {row.feedback && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">{row.feedback}</p>
        )}
        {row.course_id && (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="ghost">
              <Link
                to="/member/courses/$id"
                params={{ id: row.course_id }}
              >
                Open course
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
