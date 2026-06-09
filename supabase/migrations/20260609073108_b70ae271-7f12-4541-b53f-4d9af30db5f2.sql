ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expected_daily_hours numeric(4,2) NOT NULL DEFAULT 8;

ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS end_reason text;