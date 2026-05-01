-- ============ QA: read profiles org-wide (so grader can see member names) ============
CREATE POLICY "qa read all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

-- ============ QA: read & grade lesson submissions org-wide ============
CREATE POLICY "qa read all submissions"
ON public.submissions FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa update all submissions"
ON public.submissions FOR UPDATE
USING (public.has_role(auth.uid(), 'qa'::app_role));

-- ============ QA: read & grade project submissions org-wide ============
CREATE POLICY "qa read all project_submissions"
ON public.project_submissions FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa update all project_submissions"
ON public.project_submissions FOR UPDATE
USING (public.has_role(auth.uid(), 'qa'::app_role));

-- ============ QA: read assignments + progress so dashboards work ============
CREATE POLICY "qa read all assignments"
ON public.assignments FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa read all lesson_progress"
ON public.lesson_progress FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa read all project_assignments"
ON public.project_assignments FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

-- ============ QA: read course/lesson/project content for context ============
CREATE POLICY "qa read all courses"
ON public.courses FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa read all sections"
ON public.sections FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa read all lessons"
ON public.lessons FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

CREATE POLICY "qa read all projects"
ON public.projects FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

-- ============ QA: read AI reviews ============
CREATE POLICY "qa read all ai_reviews"
ON public.ai_reviews FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));

-- ============ QA: read franchises (for labeling) ============
CREATE POLICY "qa read all franchises"
ON public.franchises FOR SELECT
USING (public.has_role(auth.uid(), 'qa'::app_role));