import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateDayReport } from "@/lib/day-report.functions";
import type { DayReportPayload } from "@/lib/day-report-types";
import { DayReportCard } from "./DayReportCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  /**
   * Target member. Omit for self (the logged-in member). When set, the caller
   * must be the member, a CEO, or the incharge of their franchise.
   */
  userId?: string;
}

/**
 * Generates today's report on view and renders the card. Always current — it
 * doesn't depend on the member having cleanly clocked out. Server-side auth
 * restricts who can generate for whom.
 */
export function MemberTodayReport({ userId }: Props) {
  const generateFn = useServerFn(generateDayReport);
  const [payload, setPayload] = React.useState<DayReportPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      try {
        const res = await generateFn({ data: { userId, accessToken } });
        if (res.ok) setPayload(res.payload ?? null);
        else setPayload(null);
      } catch {
        setPayload(null);
      }
      setLoading(false);
    })();
  }, [userId, generateFn]);

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
