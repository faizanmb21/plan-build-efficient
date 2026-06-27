-- Grants a small allowlist of users full course-authoring write access on
-- courses / sections / lessons and the related storage buckets, without
-- giving them the broader CEO role. Currently used to scope Maida (Sargodha
-- Incharge) into CEO-equivalent course creation.
--
-- The allowlist is encoded as a SQL function so it can be updated in one
-- place. Keep it in sync with COURSE_AUTHOR_IDS in src/lib/access.ts.

CREATE OR REPLACE FUNCTION public.is_course_author(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uid IN (
    '1152f132-7263-481e-9ecd-ed86ecc4bf0b'::uuid  -- Maida (Sargodha Incharge)
  );
$$;

-- ---------------------------------------------------------------------------
-- Table policies (additive — do not touch the existing "ceo all *" policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "course authors all courses" ON public.courses;
CREATE POLICY "course authors all courses"
  ON public.courses
  FOR ALL
  USING (public.is_course_author(auth.uid()))
  WITH CHECK (public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course authors all sections" ON public.sections;
CREATE POLICY "course authors all sections"
  ON public.sections
  FOR ALL
  USING (public.is_course_author(auth.uid()))
  WITH CHECK (public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course authors all lessons" ON public.lessons;
CREATE POLICY "course authors all lessons"
  ON public.lessons
  FOR ALL
  USING (public.is_course_author(auth.uid()))
  WITH CHECK (public.is_course_author(auth.uid()));

-- Also let course authors read draft courses/sections/lessons (CEO can
-- already read drafts via the "ceo all *" policies; authors need it too so
-- they can edit unpublished work).
DROP POLICY IF EXISTS "course authors read draft courses" ON public.courses;
CREATE POLICY "course authors read draft courses"
  ON public.courses
  FOR SELECT
  USING (public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course authors read draft sections" ON public.sections;
CREATE POLICY "course authors read draft sections"
  ON public.sections
  FOR SELECT
  USING (public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course authors read draft lessons" ON public.lessons;
CREATE POLICY "course authors read draft lessons"
  ON public.lessons
  FOR SELECT
  USING (public.is_course_author(auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage bucket policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "thumbnails course authors write" ON storage.objects;
CREATE POLICY "thumbnails course authors write"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'thumbnails' AND public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "thumbnails course authors update" ON storage.objects;
CREATE POLICY "thumbnails course authors update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'thumbnails' AND public.is_course_author(auth.uid()))
  WITH CHECK (bucket_id = 'thumbnails' AND public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "thumbnails course authors delete" ON storage.objects;
CREATE POLICY "thumbnails course authors delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'thumbnails' AND public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course-content course authors write" ON storage.objects;
CREATE POLICY "course-content course authors write"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'course-content' AND public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course-content course authors update" ON storage.objects;
CREATE POLICY "course-content course authors update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'course-content' AND public.is_course_author(auth.uid()))
  WITH CHECK (bucket_id = 'course-content' AND public.is_course_author(auth.uid()));

DROP POLICY IF EXISTS "course-content course authors delete" ON storage.objects;
CREATE POLICY "course-content course authors delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'course-content' AND public.is_course_author(auth.uid()));
