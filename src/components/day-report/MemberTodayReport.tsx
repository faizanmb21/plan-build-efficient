import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchDayReport } from "@/lib/day-report.functions";
import type { DayReportPayload } from "@/lib/day-report-types";
import { DayReportCard } from "./DayReportCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  userId: string;
}

/**
 * Fetches today's day report for a given member and renders the card.
 * Renders nothing if no report exists yet. Used by Incharge and CEO views.
 */
export function MemberTodayReport({ userId }: Props) {
  const fetchFn = useServerFn(fetchDayReport);
  const [payload, setPayload] = React.useState<DayReportPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetchFn({
        data: { userId, accessToken: sess.session?.access_token },
      });
      if (res.ok) setPayload(res.payload ?? null);
      setLoading(false);
    })();
  }, [userId, fetchFn]);

  if (loading || !payload) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Today's report</CardTitle>
      </CardHeader>
      <CardContent>
        <DayReportCard payload={payload} framed={false} />
      </CardContent>
    </Card>
  );
}
