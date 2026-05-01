import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileCheck, Clock, CheckCircle2, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/qa/")({
  component: QaDashboard,
});

type Counts = { pending: number; approved: number; revision: number; lessonPending: number; projectPending: number };

function QaDashboard() {
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [recentPending, setRecentPending] = React.useState<
    { id: string; member: string; title: string; created_at: string; kind: "lesson" | "project" }[]
  >([]);

  const load = React.useCallback(async () => {
    const [{ data: lSubs }, { data: pSubs }] = await Promise.all([
      supabase
        .from("submissions")
        .select("id,status,created_at,user_id,lesson_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("project_submissions")
        .select("id,status,created_at,user_id,project_id")
        .order("created_at", { ascending: false }),
    ]);

    const lessons = lSubs ?? [];
    const projects = pSubs ?? [];

    const pendingLessons = lessons.filter((s) => s.status === "pending");
    const pendingProjects = projects.filter((s) => s.status === "pending");

    const userIds = Array.from(
      new Set([
        ...pendingLessons.slice(0, 8).map((s) => s.user_id),
        ...pendingProjects.slice(0, 8).map((s) => s.user_id),
      ]),
    );
    const lessonIds = Array.from(new Set(pendingLessons.slice(0, 8).map((s) => s.lesson_id)));
    const projectIds = Array.from(new Set(pendingProjects.slice(0, 8).map((s) => s.project_id)));

    const [{ data: profiles }, { data: lessonRows }, { data: projectRows }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id,full_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      lessonIds.length
        ? supabase.from("lessons").select("id,title").in("id", lessonIds)
        : Promise.resolve({ data: [] as any[] }),
      projectIds.length
        ? supabase.from("projects").select("id,title").in("id", projectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p.full_name ?? "Member"));
    const lessonMap = new Map<string, string>();
    (lessonRows ?? []).forEach((l: any) => lessonMap.set(l.id, l.title ?? "Lesson"));
    const projectMap = new Map<string, string>();
    (projectRows ?? []).forEach((p: any) => projectMap.set(p.id, p.title ?? "Project"));

    const recent = [
      ...pendingLessons.slice(0, 5).map((s) => ({
        id: s.id,
        member: profileMap.get(s.user_id) ?? "Member",
        title: lessonMap.get(s.lesson_id) ?? "Lesson",
        created_at: s.created_at,
        kind: "lesson" as const,
      })),
      ...pendingProjects.slice(0, 5).map((s) => ({
        id: s.id,
        member: profileMap.get(s.user_id) ?? "Member",
        title: projectMap.get(s.project_id) ?? "Project",
        created_at: s.created_at,
        kind: "project" as const,
      })),
    ]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 8);

    setRecentPending(recent);
    setCounts({
      pending: pendingLessons.length + pendingProjects.length,
      approved:
        lessons.filter((s) => s.status === "approved").length +
        projects.filter((s) => s.status === "approved").length,
      revision:
        lessons.filter((s) => s.status === "revision").length +
        projects.filter((s) => s.status === "revision").length,
      lessonPending: pendingLessons.length,
      projectPending: pendingProjects.length,
    });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!counts) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QA dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Grade lesson practicals and project submissions across all franchises.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pending review"
          value={counts.pending}
          tone="amber"
          icon={Clock}
          subtitle={`${counts.lessonPending} lessons · ${counts.projectPending} projects`}
        />
        <Stat label="Approved" value={counts.approved} tone="emerald" icon={CheckCircle2} />
        <Stat label="Revision" value={counts.revision} tone="rose" icon={RefreshCcw} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Latest pending submissions</CardTitle>
            <CardDescription>Newest first across the whole organization.</CardDescription>
          </div>
          <Button asChild size="sm">
            <Link to="/qa/submissions">Open queue</Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y">
          {recentPending.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing waiting — great work 🎉</p>
          ) : (
            recentPending.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate font-medium">{r.title}</span>
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {r.kind}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.member} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/qa/submissions">Review</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose";
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
      : tone === "emerald"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-300";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${cls}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
