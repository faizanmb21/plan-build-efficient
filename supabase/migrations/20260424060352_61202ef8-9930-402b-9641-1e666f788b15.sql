UPDATE public.lessons
SET content = jsonb_build_object(
  'url', content->>'video_url',
  'path', content->>'storage_path'
)
WHERE type = 'video'
  AND content ? 'video_url';