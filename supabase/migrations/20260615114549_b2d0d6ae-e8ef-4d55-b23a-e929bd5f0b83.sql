ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS requires_submission boolean NOT NULL DEFAULT false;

UPDATE public.lessons
  SET requires_submission = true
  WHERE type = 'practical'
     OR (content ? 'assignment' AND content->'assignment' IS NOT NULL AND content->'assignment' <> 'null'::jsonb);
