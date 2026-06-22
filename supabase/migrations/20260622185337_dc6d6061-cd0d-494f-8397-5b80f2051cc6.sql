DROP POLICY IF EXISTS "project-briefs ceo write" ON storage.objects;
DROP POLICY IF EXISTS "project-briefs incharge write" ON storage.objects;

CREATE POLICY "project-briefs ceo write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'submissions'
    AND starts_with(name, 'project-briefs/')
    AND public.has_role(auth.uid(), 'ceo')
  );

CREATE POLICY "project-briefs incharge write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'submissions'
    AND starts_with(name, 'project-briefs/')
    AND public.has_role(auth.uid(), 'incharge')
  );