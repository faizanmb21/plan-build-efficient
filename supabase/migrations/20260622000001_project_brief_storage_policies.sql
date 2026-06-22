-- Allow CEO and Incharge to upload project reference attachments to the
-- submissions bucket under the project-briefs/ prefix.
-- The existing "submissions own write" policy uses (storage.foldername(name))[1]
-- which resolves to "project-briefs" (not the user's UUID) for this path, so
-- CEO/Incharge uploads were failing with an RLS violation.

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
