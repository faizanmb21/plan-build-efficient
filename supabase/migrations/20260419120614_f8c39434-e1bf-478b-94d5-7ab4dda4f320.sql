
-- ============ Tables ============

CREATE TABLE public.study_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  idle_seconds INTEGER NOT NULL DEFAULT 0,
  blur_count INTEGER NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_sessions_user ON public.study_sessions(user_id, started_at DESC);
CREATE INDEX idx_study_sessions_open ON public.study_sessions(user_id) WHERE ended_at IS NULL;

CREATE TABLE public.attendance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('webcam','screen')),
  storage_path TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_session ON public.attendance_snapshots(session_id, captured_at);
CREATE INDEX idx_snapshots_user ON public.attendance_snapshots(user_id, captured_at DESC);

CREATE TABLE public.ai_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  score INTEGER,
  rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  comments TEXT,
  frames_analyzed INTEGER NOT NULL DEFAULT 0,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_reviews_submission ON public.ai_reviews(submission_id, created_at DESC);

-- ============ RLS ============

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reviews ENABLE ROW LEVEL SECURITY;

-- study_sessions
CREATE POLICY "users own sessions" ON public.study_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "incharge read franchise sessions" ON public.study_sessions
  FOR SELECT USING (
    public.has_role(auth.uid(), 'incharge'::app_role) AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = study_sessions.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "ceo all sessions" ON public.study_sessions
  FOR ALL USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

-- attendance_snapshots
CREATE POLICY "users own snapshots" ON public.attendance_snapshots
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "incharge read franchise snapshots" ON public.attendance_snapshots
  FOR SELECT USING (
    public.has_role(auth.uid(), 'incharge'::app_role) AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = attendance_snapshots.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "ceo all snapshots" ON public.attendance_snapshots
  FOR ALL USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

-- ai_reviews
CREATE POLICY "users read own ai_reviews" ON public.ai_reviews
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = ai_reviews.submission_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "incharge read franchise ai_reviews" ON public.ai_reviews
  FOR SELECT USING (
    public.has_role(auth.uid(), 'incharge'::app_role) AND EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE s.id = ai_reviews.submission_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "ceo all ai_reviews" ON public.ai_reviews
  FOR ALL USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

-- ============ Storage bucket ============

INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance', 'attendance', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users upload own attendance"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attendance'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "users read own attendance"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attendance'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "incharge read franchise attendance"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attendance'
  AND public.has_role(auth.uid(), 'incharge'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.franchise_id = public.get_user_franchise(auth.uid())
  )
);

CREATE POLICY "ceo read all attendance"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attendance'
  AND public.has_role(auth.uid(), 'ceo'::app_role)
);

-- ============ Helper: stale session cleanup ============
CREATE OR REPLACE FUNCTION public.close_stale_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count INTEGER;
BEGIN
  WITH closed AS (
    UPDATE public.study_sessions
    SET ended_at = last_heartbeat_at
    WHERE ended_at IS NULL
      AND last_heartbeat_at < now() - interval '10 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO closed_count FROM closed;
  RETURN closed_count;
END;
$$;
