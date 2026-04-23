-- ============ PROJECTS MODULE ============

-- 1. projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  attachment_path text,
  deadline timestamptz,
  created_by uuid NOT NULL,
  franchise_id uuid REFERENCES public.franchises(id) ON DELETE SET NULL,
  status public.course_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_franchise ON public.projects(franchise_id);
CREATE INDEX idx_projects_created_by ON public.projects(created_by);

-- 2. project_assignments table
CREATE TABLE public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  priority public.assignment_priority NOT NULL DEFAULT 'mandatory',
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_assignments_user ON public.project_assignments(user_id);
CREATE INDEX idx_project_assignments_project ON public.project_assignments(project_id);

-- 3. project_submissions table
CREATE TABLE public.project_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_url text NOT NULL,
  status public.submission_status NOT NULL DEFAULT 'pending',
  letter_grade text,
  grade integer,
  feedback text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_submissions_user ON public.project_submissions(user_id);
CREATE INDEX idx_project_submissions_project ON public.project_submissions(project_id);
CREATE INDEX idx_project_submissions_status ON public.project_submissions(status);

-- ============ updated_at trigger for projects ============
CREATE OR REPLACE FUNCTION public.touch_projects_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.touch_projects_updated_at();

-- ============ RLS ============
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_submissions ENABLE ROW LEVEL SECURITY;

-- ---------- projects policies ----------
CREATE POLICY "ceo all projects"
  ON public.projects FOR ALL
  USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "incharge read franchise or global projects"
  ON public.projects FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND (franchise_id IS NULL OR franchise_id = public.get_user_franchise(auth.uid()))
  );

CREATE POLICY "incharge insert franchise projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND franchise_id = public.get_user_franchise(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "incharge update own franchise projects"
  ON public.projects FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND franchise_id = public.get_user_franchise(auth.uid())
  );

CREATE POLICY "incharge delete own franchise projects"
  ON public.projects FOR DELETE
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND franchise_id = public.get_user_franchise(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "members read assigned projects"
  ON public.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_assignments pa
      WHERE pa.project_id = projects.id AND pa.user_id = auth.uid()
    )
  );

-- ---------- project_assignments policies ----------
CREATE POLICY "ceo all project_assignments"
  ON public.project_assignments FOR ALL
  USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "incharge read franchise project_assignments"
  ON public.project_assignments FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = project_assignments.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "incharge insert franchise project_assignments"
  ON public.project_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = project_assignments.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "incharge delete franchise project_assignments"
  ON public.project_assignments FOR DELETE
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = project_assignments.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "users read own project_assignments"
  ON public.project_assignments FOR SELECT
  USING (user_id = auth.uid());

-- ---------- project_submissions policies ----------
CREATE POLICY "ceo all project_submissions"
  ON public.project_submissions FOR ALL
  USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "incharge read franchise project_submissions"
  ON public.project_submissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = project_submissions.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "incharge update franchise project_submissions"
  ON public.project_submissions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'incharge'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = project_submissions.user_id
        AND p.franchise_id = public.get_user_franchise(auth.uid())
    )
  );

CREATE POLICY "users read own project_submissions"
  ON public.project_submissions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users insert own project_submissions"
  ON public.project_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_submissions;