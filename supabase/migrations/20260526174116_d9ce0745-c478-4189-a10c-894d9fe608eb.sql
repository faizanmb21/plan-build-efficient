
-- 1. Fix QA privilege escalation: remove unassigned bypass
CREATE OR REPLACE FUNCTION public.qa_can_access_franchise(_uid uuid, _franchise_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_uid, 'qa'::app_role) AND EXISTS (
    SELECT 1 FROM public.qa_franchise_assignments
    WHERE user_id = _uid AND franchise_id = _franchise_id
  )
$function$;

-- 2. Scope incharge storage reads on submissions bucket by franchise
DROP POLICY IF EXISTS "submissions incharge read" ON storage.objects;
CREATE POLICY "submissions incharge read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'submissions'
  AND public.has_role(auth.uid(), 'incharge'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.id)::text = (storage.foldername(name))[1]
      AND p.franchise_id = public.get_user_franchise(auth.uid())
  )
);

-- Also add QA storage read scoped to assigned franchises
DROP POLICY IF EXISTS "submissions qa read" ON storage.objects;
CREATE POLICY "submissions qa read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'submissions'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.id)::text = (storage.foldername(name))[1]
      AND public.qa_can_access_franchise(auth.uid(), p.franchise_id)
  )
);

-- 3. Restrict submissions INSERT to assigned lessons
DROP POLICY IF EXISTS "users own submissions insert" ON public.submissions;
CREATE POLICY "users own submissions insert"
ON public.submissions
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.lessons l ON l.id = submissions.lesson_id
    JOIN public.sections s ON s.id = l.section_id
    WHERE a.user_id = auth.uid() AND a.course_id = s.course_id
  )
);

-- 4. Restrict project_submissions INSERT to assigned projects
DROP POLICY IF EXISTS "users insert own project_submissions" ON public.project_submissions;
CREATE POLICY "users insert own project_submissions"
ON public.project_submissions
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_assignments pa
    WHERE pa.project_id = project_submissions.project_id
      AND pa.user_id = auth.uid()
  )
);

-- 5. Require authentication to read realtime broadcast messages (defense in depth;
-- postgres_changes payloads are already RLS-filtered by table policies)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);
