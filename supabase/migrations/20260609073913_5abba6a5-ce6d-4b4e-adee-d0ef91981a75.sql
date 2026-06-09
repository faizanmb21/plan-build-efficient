ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS paused_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.study_sessions
  SET status = CASE WHEN ended_at IS NULL THEN 'active' ELSE 'completed' END
  WHERE status = 'active' AND ended_at IS NOT NULL;

ALTER TABLE public.study_sessions
  ADD CONSTRAINT study_sessions_status_check
  CHECK (status IN ('active','paused','completed'));