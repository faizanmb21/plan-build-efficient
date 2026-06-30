import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generateDayReport, listDayReports } from "@/lib/day-report.functions";
import type { DayReportPayload } from "@/lib/day-report-types";
import { DayReportCard } from "@/components/day-report/DayReportCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, History } from "lucide-react";

export const Route = createFileRoute("/member/today")({
  component: TodayPage,
});

function TodayPage() {
  const { user } = useAuth();
  const generateToday = useServerFn(generateDayReport);
  const listAll = useServerFn(listDayReports);

  const [loading, setLoading] = React.useState(true);
  const [payload, setPayload] = React.useState<DayReportPayload | null>(null);
  const [history, setHistory] = React.useState<
    { reportDate: string; payload: DayReportPayload }[]
  >([]);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    // Generate fresh so the report always reflects the member's real activity,
    // even if they never manually clocked out (left tab open, auto-idle, etc.).
    // Generate first so the upserted row is included in the history list below.
    const todayRes = await generateToday({ data: { accessToken } });
    const listRes = await listAll({ data: { accessToken, limit: 14 } });
    if (todayRes.ok) setPayload(todayRes.payload ?? null);
    if (listRes.ok) {
      setHistory(
        listRes.reports.map((r) => ({
          reportDate: r.reportDate,
          payload: r.payload,
        })),
      );
    }
    setLoading(false);
  }, [user, generateToday, listAll]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today's report</h1>
          <p className="text-sm text-muted-foreground">
            Screenshot this card after clocking out and share it in the training group.
          </p>
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh
        </Button>
      </header>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading today's report…
          </CardContent>
        </Card>
      ) : payload ? (
        <DayReportCard payload={payload} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No report yet. Clock in, do some work, then clock out — your report
            will appear here automatically.
          </CardContent>
        </Card>
      )}

      {history.length > 1 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Recent days
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {history.slice(1).map((r) => (
              <Link
                key={r.reportDate}
                to="/member/reports/$date"
                params={{ date: r.reportDate }}
                className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-card/50 p-3 transition hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.reportDate}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.payload.hoursToday}h ·{" "}
                    {r.payload.lessonsCompleted.length} lessons ·{" "}
                    {r.payload.lateMinutes > 0
                      ? `${r.payload.lateMinutes}m late`
                      : "on time"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
