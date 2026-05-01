
CREATE OR REPLACE FUNCTION public.backfill_grading_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_rec record;
  lesson_rec record;
  reviewer uuid;
  bucket int;
  big_bucket bigint;
  letter text;
  num_grade int;
  status_v public.submission_status;
  fb text;
  inserted_pending int := 0;
  inserted_approved int := 0;
  inserted_revision int := 0;
  feedback_aplus text[] := ARRAY[
    'Outstanding work — every cut felt deliberate and the export was flawless.',
    'Top tier. Pacing, sound, and color all hit the brief perfectly.',
    'A+ effort. This is the standard the rest of the team should be matching.',
    'Brilliant — your understanding of rhythm and intent is showing through.',
    'Exceptional execution. Captions were spot on and the audio mix was clean.'
  ];
  feedback_a text[] := ARRAY[
    'Strong work. Pacing was natural and the export settings were correct.',
    'Solid edit. A few caption timings were slightly off but nothing major.',
    'Good — color grading was consistent across all clips. Keep it up.',
    'Nice rhythm and clean cuts. Tighten the intro by ~2 seconds next time.',
    'Well done. Audio levels balanced, sound design tasteful.'
  ];
  feedback_b text[] := ARRAY[
    'Acceptable but feels mechanical — try holding shots 30% longer where the speaker emphasises.',
    'Got the basics right. Captions had 3 timing slips and a typo. Be careful.',
    'Decent edit. Color is inconsistent across clips — apply a unified LUT.',
    'Workable but the audio mix is muddy in the second half.',
    'Passable. Typography choices clash with the brand palette.'
  ];
  feedback_c text[] := ARRAY[
    'Needs a redo. The brief asked to PERSUADE — your edit only INFORMS. Re-cut for emotional pull.',
    'Please resubmit. Captions are out of sync in 6+ places and the audio peaks are clipping.',
    'Redo required. Export settings are wrong — please re-export H.264 1080p.',
    'Resubmission needed — three obvious typos in the lower thirds and inconsistent fonts.',
    'Please redo. The pacing is jarring and there is no clear narrative arc.'
  ];
  i bigint := 0;
BEGIN
  FOR member_rec IN
    SELECT p.id AS user_id, p.franchise_id, f.manager_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'member'::app_role
    LEFT JOIN public.franchises f ON f.id = p.franchise_id
    WHERE p.franchise_id IS NOT NULL
  LOOP
    reviewer := COALESCE(member_rec.manager_id,
      (SELECT user_id FROM public.user_roles WHERE role = 'ceo'::app_role LIMIT 1));

    FOR lesson_rec IN
      SELECT l.id AS lesson_id
      FROM public.lessons l
      JOIN public.sections s ON s.id = l.section_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE c.status = 'published'::course_status
      ORDER BY s.position, l.position
    LOOP
      i := i + 1;

      IF EXISTS (
        SELECT 1 FROM public.submissions
        WHERE user_id = member_rec.user_id AND lesson_id = lesson_rec.lesson_id
      ) THEN
        CONTINUE;
      END IF;

      big_bucket := (i * 17::bigint
        + abs(hashtext(member_rec.user_id::text))::bigint
        + abs(hashtext(lesson_rec.lesson_id::text))::bigint);
      bucket := (big_bucket % 100)::int;

      IF bucket < 20 THEN
        status_v := 'pending'::submission_status;
        letter := NULL; num_grade := NULL; fb := NULL;
      ELSIF bucket < 40 THEN
        status_v := 'approved'::submission_status;
        letter := 'A+'; num_grade := 100;
        fb := feedback_aplus[1 + (bucket % array_length(feedback_aplus, 1))];
      ELSIF bucket < 65 THEN
        status_v := 'approved'::submission_status;
        letter := 'A'; num_grade := 80;
        fb := feedback_a[1 + (bucket % array_length(feedback_a, 1))];
      ELSIF bucket < 80 THEN
        status_v := 'approved'::submission_status;
        letter := 'B'; num_grade := 60;
        fb := feedback_b[1 + (bucket % array_length(feedback_b, 1))];
      ELSE
        status_v := 'revision'::submission_status;
        letter := 'C'; num_grade := NULL;
        fb := feedback_c[1 + (bucket % array_length(feedback_c, 1))];
      END IF;

      IF status_v = 'pending'::submission_status THEN
        INSERT INTO public.submissions (user_id, lesson_id, file_url, status, created_at)
        VALUES (member_rec.user_id, lesson_rec.lesson_id,
                'https://example.com/seed/' || member_rec.user_id || '/' || lesson_rec.lesson_id || '.mp4',
                'pending'::submission_status,
                now() - ((bucket % 7) || ' days')::interval);
        inserted_pending := inserted_pending + 1;
      ELSE
        INSERT INTO public.submissions
          (user_id, lesson_id, file_url, status, letter_grade, grade, feedback,
           reviewed_by, reviewed_at, created_at)
        VALUES (member_rec.user_id, lesson_rec.lesson_id,
                'https://example.com/seed/' || member_rec.user_id || '/' || lesson_rec.lesson_id || '.mp4',
                status_v, letter, num_grade, fb, reviewer,
                now() - ((bucket % 25) || ' days')::interval - ((i % 12) || ' hours')::interval,
                now() - ((bucket % 25) + 1 || ' days')::interval);

        IF status_v = 'approved'::submission_status THEN
          INSERT INTO public.lesson_progress
            (user_id, lesson_id, completed, progress_percent, completed_at)
          VALUES (member_rec.user_id, lesson_rec.lesson_id, true, 100,
                  now() - ((bucket % 25) || ' days')::interval)
          ON CONFLICT (user_id, lesson_id) DO UPDATE SET
            completed = true, progress_percent = 100,
            completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);
          inserted_approved := inserted_approved + 1;
        ELSE
          inserted_revision := inserted_revision + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.assignments (user_id, course_id, priority, assigned_by)
  SELECT p.id, c.id, 'mandatory'::assignment_priority,
         (SELECT user_id FROM public.user_roles WHERE role = 'ceo'::app_role LIMIT 1)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'member'::app_role
  CROSS JOIN public.courses c
  WHERE c.status = 'published'::course_status
    AND p.franchise_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.user_id = p.id AND a.course_id = c.id
    );

  RETURN jsonb_build_object(
    'pending', inserted_pending,
    'approved', inserted_approved,
    'revision', inserted_revision
  );
END;
$$;
