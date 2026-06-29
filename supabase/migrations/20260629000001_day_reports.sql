-- End-of-day report cards generated when a trainee clocks out. One row per
-- (user_id, report_date PKT). The payload JSON holds the full structured
-- report so it can be rendered consistently in the member, incharge and CEO
-- views.

CREATE TABLE IF NOT EXISTS public.day_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);

CREATE INDEX IF NOT EXISTS day_reports_user_date_idx
  ON public.day_reports (user_id, report_date DESC);

ALTER TABLE public.day_reports ENABLE ROW LEVEL SECURITY;

-- Members read their own reports.
DROP POLICY IF EXISTS "members read own day_reports" ON public.day_reports;
CREATE POLICY "members read own day_reports"
  ON public.day_reports
  FOR SELECT
  USING (user_id = auth.uid());

-- Incharge reads reports for members in their franchise.
DROP POLICY IF EXISTS "incharge read franchise day_reports" ON public.day_reports;
CREATE POLICY "incharge read franchise day_reports"
  ON public.day_reports
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = day_reports.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

-- CEO reads everything.
DROP POLICY IF EXISTS "ceo read day_reports" ON public.day_reports;
CREATE POLICY "ceo read day_reports"
  ON public.day_reports
  FOR SELECT
  USING (public.has_role(auth.uid(), 'ceo'::app_role));

-- All writes go through service-role server functions; no INSERT/UPDATE/DELETE
-- policies for authenticated roles. service_role bypasses RLS.
