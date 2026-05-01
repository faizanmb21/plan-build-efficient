
-- 1. Table
CREATE TABLE IF NOT EXISTS public.qa_franchise_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  franchise_id uuid NOT NULL REFERENCES public.franchises(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, franchise_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_franchise_assignments_user ON public.qa_franchise_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_qa_franchise_assignments_franchise ON public.qa_franchise_assignments(franchise_id);

ALTER TABLE public.qa_franchise_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ceo manage qa assignments" ON public.qa_franchise_assignments;
CREATE POLICY "ceo manage qa assignments"
ON public.qa_franchise_assignments FOR ALL
USING (public.has_role(auth.uid(), 'ceo'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

DROP POLICY IF EXISTS "qa read own assignments" ON public.qa_franchise_assignments;
CREATE POLICY "qa read own assignments"
ON public.qa_franchise_assignments FOR SELECT
USING (user_id = auth.uid());

-- 2. Helper: qa_can_access_franchise(_uid, _franchise_id)
-- Returns true if user is a QA AND (has no franchise rows OR has a row matching _franchise_id).
CREATE OR REPLACE FUNCTION public.qa_can_access_franchise(_uid uuid, _franchise_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'qa'::app_role) AND (
    NOT EXISTS (SELECT 1 FROM public.qa_franchise_assignments WHERE user_id = _uid)
    OR EXISTS (
      SELECT 1 FROM public.qa_franchise_assignments
      WHERE user_id = _uid AND franchise_id = _franchise_id
    )
  )
$$;

-- 3. Replace existing QA "read all / update all" RLS with franchise-scoped variants.

-- submissions
DROP POLICY IF EXISTS "qa read all submissions" ON public.submissions;
DROP POLICY IF EXISTS "qa update all submissions" ON public.submissions;
CREATE POLICY "qa read scoped submissions"
ON public.submissions FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = submissions.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);
CREATE POLICY "qa update scoped submissions"
ON public.submissions FOR UPDATE
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = submissions.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- project_submissions
DROP POLICY IF EXISTS "qa read all project_submissions" ON public.project_submissions;
DROP POLICY IF EXISTS "qa update all project_submissions" ON public.project_submissions;
CREATE POLICY "qa read scoped project_submissions"
ON public.project_submissions FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = project_submissions.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);
CREATE POLICY "qa update scoped project_submissions"
ON public.project_submissions FOR UPDATE
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = project_submissions.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- profiles
DROP POLICY IF EXISTS "qa read all profiles" ON public.profiles;
CREATE POLICY "qa read scoped profiles"
ON public.profiles FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND public.qa_can_access_franchise(auth.uid(), profiles.franchise_id)
);

-- franchises (QA can see ones they're assigned to, or all if unscoped)
DROP POLICY IF EXISTS "qa read all franchises" ON public.franchises;
CREATE POLICY "qa read scoped franchises"
ON public.franchises FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND public.qa_can_access_franchise(auth.uid(), franchises.id)
);

-- assignments
DROP POLICY IF EXISTS "qa read all assignments" ON public.assignments;
CREATE POLICY "qa read scoped assignments"
ON public.assignments FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = assignments.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- project_assignments
DROP POLICY IF EXISTS "qa read all project_assignments" ON public.project_assignments;
CREATE POLICY "qa read scoped project_assignments"
ON public.project_assignments FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = project_assignments.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- lesson_progress
DROP POLICY IF EXISTS "qa read all lesson_progress" ON public.lesson_progress;
CREATE POLICY "qa read scoped lesson_progress"
ON public.lesson_progress FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = lesson_progress.user_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- ai_reviews
DROP POLICY IF EXISTS "qa read all ai_reviews" ON public.ai_reviews;
CREATE POLICY "qa read scoped ai_reviews"
ON public.ai_reviews FOR SELECT
USING (
  public.has_role(auth.uid(), 'qa'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = ai_reviews.submission_id
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- courses, sections, lessons, projects: keep "qa read all" so QA can see content
-- regardless of franchise (content is org-wide). Already exist.
