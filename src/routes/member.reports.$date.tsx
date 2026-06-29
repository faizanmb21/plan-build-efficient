import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchDayReport } from "@/lib/day-report.functions";
import type { DayReportPayload } from "@/lib/day-report-types";
import { DayReportCard } from "@/components/day-report/DayReportCard";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/member/reports/$date")({
  component: ReportByDatePage,
});

function ReportByDatePage() {
  const { date } = Route.useParams();
  const fetchOne = useServerFn(fetchDayReport);
  const [loading, setLoading] = React.useState(true);
  const [payload, setPayload] = React.useState<DayReportPayload | null>(null);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetchOne({
        data: { reportDate: date, accessToken: sess.session?.access_token },
      });
      if (res.ok) setPayload(res.payload);
      setLoading(false);
    })();
  }, [date, fetchOne]);

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost">
        <Link to="/member/today">
          <ArrowLeft className="h-4 w-4" /> Back to today
        </Link>
      </Button>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
          </CardContent>
        </Card>
      ) : payload ? (
        <DayReportCard payload={payload} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No report saved for {date}.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
