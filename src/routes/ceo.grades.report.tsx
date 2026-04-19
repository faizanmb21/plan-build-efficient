import * as React from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { aggregateGrades, formatRelative, type GradedRow } from "@/lib/grade-utils";
import { RoleGuard } from "@/components/RoleGuard";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/ceo/grades/report")({
  validateSearch: (search: Record<string, unknown>) => ({
    member: typeof search.member === "string" ? search.member : undefined,
  }),
  component: () => (
    <RoleGuard allow={["ceo"]}>
      <ReportPage />
    </RoleGuard>
  ),
});

interface EnrichedRow extends GradedRow {
  lesson_title: string;
  course_title: string;
}

function ReportPage() {
  const { member } = useSearch({ from: "/ceo/grades/report" });
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState<string>("");
  const [franchise, setFranchise] = React.useState<string>("");
  const [rows, setRows] = React.useState<EnrichedRow[]>([]);

  React.useEffect(() => {
    if (!member) return;
    (async () => {
      setLoading(true);
      const [{ data: profile }, { data: subs }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,franchise_id,franchises(name)")
          .eq("id", member)
          .maybeSingle(),
        supabase
          .from("submissions")
          .select(
            "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
          )
          .eq("user_id", member)
          .order("reviewed_at", { ascending: false, nullsFirst: false }),
      ]);

      const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
      const { data: lessons } = lessonIds.length
        ? await supabase
            .from("lessons")
            .select("id,title,sections(courses(title))")
            .in("id", lessonIds)
        : { data: [] as unknown[] };

      type LS = { id: string; title: string; sections: { courses: { title: string } | null } | null };
      const lm = new Map<string, LS>();
      (lessons as LS[] | null | undefined)?.forEach((l) => lm.set(l.id, l));

      setName((profile as { full_name?: string | null } | null)?.full_name ?? "Member");
      const fr = (profile as { franchises?: { name?: string } | null } | null)?.franchises;
      setFranchise(fr?.name ?? "");
      setRows(
        (subs ?? []).map((s) => ({
          ...s,
          lesson_title: lm.get(s.lesson_id)?.title ?? "Lesson",
          course_title: lm.get(s.lesson_id)?.sections?.courses?.title ?? "—",
        })),
      );
      setLoading(false);

      // Trigger print after a short paint delay
      setTimeout(() => window.print(), 600);
    })();
  }, [member]);

  const agg = React.useMemo(() => aggregateGrades(rows), [rows]);

  if (!member) {
    return <div className="p-8">Missing ?member=… parameter.</div>;
  }
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-white text-black min-h-screen p-8 print:p-6">
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
        }
        .grade-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .grade-table th, .grade-table td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
        .grade-table th { background: #f3f4f6; font-weight: 600; }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="mb-6 border-b pb-4">
        <div className="text-xs uppercase tracking-widest text-gray-500">IRM Academy · Grade Report</div>
        <h1 className="mt-1 text-3xl font-bold">{name}</h1>
        <p className="text-sm text-gray-600">
          {franchise || "No franchise"} · Generated {new Date().toLocaleString()}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-5 gap-3">
        <Tile label="Total graded" value={String(agg.total)} />
        <Tile label="A+" value={String(agg.aPlus)} />
        <Tile label="A" value={String(agg.a)} />
        <Tile label="B" value={String(agg.b)} />
        <Tile label="C / Redo" value={String(agg.c)} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Tile label="Average" value={`${agg.averagePercent}%`} />
        <Tile label="Pass rate" value={`${agg.passRate}%`} />
        <Tile label="Redo rate" value={`${agg.redoRate}%`} />
      </div>

      <h2 className="mb-2 text-lg font-semibold">Submission history</h2>
      <table className="grade-table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Lesson</th>
            <th>Letter</th>
            <th>%</th>
            <th>Status</th>
            <th>Feedback</th>
            <th>Graded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.course_title}</td>
              <td>{r.lesson_title}</td>
              <td>{r.letter_grade ?? "—"}</td>
              <td>{r.grade ?? "—"}</td>
              <td>{r.status}</td>
              <td>{r.feedback ?? ""}</td>
              <td>{formatRelative(r.reviewed_at ?? r.created_at)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center", color: "#666" }}>No submissions yet.</td></tr>
          )}
        </tbody>
      </table>

      <p className="mt-8 text-xs text-gray-500">
        Confidential — IRM Academy internal use only.
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-300 p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}
