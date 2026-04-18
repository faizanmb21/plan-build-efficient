
-- Helper: seed demo content for IRM Academy.
-- Idempotent. Looks up auth users by email (created by server fn beforehand).
CREATE OR REPLACE FUNCTION public.seed_demo_content()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f_sargodha uuid;
  f_lahore uuid;
  f_pdk uuid;
  ceo_uid uuid;
  in_sar uuid;
  in_lah uuid;
  in_pdk uuid;
  you_uid uuid;
  course_ids uuid[];
  cid uuid;
  sid uuid;
  member_emails text[] := ARRAY[
    'member01@irmacademy.test','member02@irmacademy.test','member03@irmacademy.test',
    'member04@irmacademy.test','member05@irmacademy.test','member06@irmacademy.test',
    'member07@irmacademy.test','member08@irmacademy.test','member09@irmacademy.test',
    'member10@irmacademy.test','member11@irmacademy.test','member12@irmacademy.test',
    'member13@irmacademy.test','member14@irmacademy.test','member15@irmacademy.test',
    'member16@irmacademy.test','member17@irmacademy.test','member18@irmacademy.test',
    'member19@irmacademy.test','member20@irmacademy.test','you@irmacademy.test'
  ];
  member_names text[] := ARRAY[
    'Hamza Iqbal','Ayesha Tariq','Bilal Ahmed','Saad Mehmood','Fatima Noor',
    'Usman Raza','Zainab Ali','Abdul Rehman','Maira Khan','Hassan Sheikh',
    'Iqra Yousuf','Talha Munir','Sana Javed','Owais Mirza','Hira Bashir',
    'Daniyal Saleem','Mehwish Anwar','Faizan Qureshi','Komal Shah','Arham Siddiqui',
    'Demo Creator (You)'
  ];
  member_franchises uuid[];
  i int;
  uid uuid;
  lesson_ids uuid[];
  lid uuid;
  total_lessons int;
  done_target int;
  pillar_titles text[] := ARRAY[
    'Software Operation',
    'Comprehension',
    'Storyboarding & Pre-Production Thinking',
    'Pacing & Editorial Rhythm',
    'Typography & Text Design',
    'Color & Visual Consistency',
    'Caption & Text Accuracy',
    'Sound Design & Audio',
    'Format-Specific Editing',
    'Motion Graphics & Animation',
    'AI Tools & Workflow',
    'File & Export Management'
  ];
  pillar_descs text[] := ARRAY[
    'Pure tool mechanics — keyboard shortcuts, timeline navigation, masking, keyframing, and clean export settings across CapCut, Premiere Pro and After Effects.',
    'Read a brief and explain back what the video should accomplish. Identify the key message, the audience, and the intent: inform, persuade, or entertain.',
    'Plan visually before touching the timeline. Shot-by-shot planning from a script, B-roll choices, transitions, and shot-type selection.',
    'The internal clock of editing — when to cut, how long to hold a shot, when to speed up or slow down. Match rhythm to music and voice energy.',
    'Font pairing, hierarchy, readability over moving backgrounds, lower-third design, and consistent text styling across a project.',
    'Make footage look cohesive. White balance, basic grading, LUTs, brand palette, and matching tone across clips shot in different lighting.',
    'Spelling, punctuation, timing, and natural phrase breaks. Match captions exactly to spoken audio. Critical for ESL teams.',
    'Dialogue levels, music ducking, SFX placement, noise reduction, crossfades, and knowing when silence is more powerful than music.',
    'Talking head, VSL, e-learning, short-form social, long-form YouTube, and ads — each format demands a different editing philosophy.',
    'Smooth keyframe animation with proper easing, animated text intros, simple infographic animations, and tasteful motion that adds value.',
    'Use AI as a force multiplier — HeyGen, Runway, auto-captioning, Midjourney, AI audio cleanup, and prompt writing for editors.',
    'Professional hygiene — correct export settings per platform, organized bins, proxy workflows, file naming, and version control.'
  ];
  pillar_thumbs text[] := ARRAY[
    'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&q=80',
    'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&q=80',
    'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80',
    'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80',
    'https://images.unsplash.com/photo-1505682499293-233fb141754c?w=800&q=80',
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80',
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&q=80',
    'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80',
    'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=800&q=80',
    'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&q=80',
    'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&q=80'
  ];
  section_titles text[] := ARRAY['Foundations','Hands-on Practice','Mastery & Benchmark'];
  sample_video text := 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  sample_pdf text := 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
BEGIN
  -- ============ Look up auth users ============
  SELECT id INTO ceo_uid FROM auth.users WHERE email = 'ceo@irmacademy.test';
  SELECT id INTO in_sar FROM auth.users WHERE email = 'incharge.sargodha@irmacademy.test';
  SELECT id INTO in_lah FROM auth.users WHERE email = 'incharge.lahore@irmacademy.test';
  SELECT id INTO in_pdk FROM auth.users WHERE email = 'incharge.pdk@irmacademy.test';
  SELECT id INTO you_uid FROM auth.users WHERE email = 'you@irmacademy.test';

  IF ceo_uid IS NULL OR in_sar IS NULL OR in_lah IS NULL OR in_pdk IS NULL THEN
    RAISE EXCEPTION 'Auth users not found. Run the seed server function first.';
  END IF;

  -- ============ Franchises (idempotent by name) ============
  INSERT INTO public.franchises (name, location)
  VALUES ('IRM Sargodha','Sargodha, Pakistan')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.franchises (name, location)
  VALUES ('IRM Lahore','Lahore, Pakistan')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.franchises (name, location)
  VALUES ('IRM PDK','Pindi, Pakistan')
  ON CONFLICT DO NOTHING;

  SELECT id INTO f_sargodha FROM public.franchises WHERE name = 'IRM Sargodha' LIMIT 1;
  SELECT id INTO f_lahore FROM public.franchises WHERE name = 'IRM Lahore' LIMIT 1;
  SELECT id INTO f_pdk FROM public.franchises WHERE name = 'IRM PDK' LIMIT 1;

  -- Set franchise managers
  UPDATE public.franchises SET manager_id = in_sar WHERE id = f_sargodha;
  UPDATE public.franchises SET manager_id = in_lah WHERE id = f_lahore;
  UPDATE public.franchises SET manager_id = in_pdk WHERE id = f_pdk;

  -- ============ Roles ============
  INSERT INTO public.user_roles (user_id, role) VALUES (ceo_uid, 'ceo')
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (in_sar, 'incharge', f_sargodha)
  ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;
  INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (in_lah, 'incharge', f_lahore)
  ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;
  INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (in_pdk, 'incharge', f_pdk)
  ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;

  -- ============ Profile names + franchise for incharges ============
  UPDATE public.profiles SET full_name = 'Imran Iqbal (CEO)' WHERE id = ceo_uid;
  UPDATE public.profiles SET full_name = 'Sargodha Incharge', franchise_id = f_sargodha WHERE id = in_sar;
  UPDATE public.profiles SET full_name = 'Lahore Incharge', franchise_id = f_lahore WHERE id = in_lah;
  UPDATE public.profiles SET full_name = 'PDK Incharge', franchise_id = f_pdk WHERE id = in_pdk;

  -- ============ Members: assign franchises round-robin ============
  member_franchises := ARRAY[
    f_sargodha,f_lahore,f_pdk,f_sargodha,f_lahore,
    f_pdk,f_sargodha,f_lahore,f_pdk,f_sargodha,
    f_lahore,f_pdk,f_sargodha,f_lahore,f_pdk,
    f_sargodha,f_lahore,f_pdk,f_sargodha,f_lahore,
    f_sargodha  -- you@ → Sargodha
  ];

  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NOT NULL THEN
      UPDATE public.profiles
      SET full_name = member_names[i], franchise_id = member_franchises[i]
      WHERE id = uid;
      INSERT INTO public.user_roles (user_id, role, franchise_id)
      VALUES (uid, 'member', member_franchises[i])
      ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;
    END IF;
  END LOOP;

  -- ============ Courses + sections + lessons ============
  course_ids := ARRAY[]::uuid[];
  FOR i IN 1..12 LOOP
    SELECT id INTO cid FROM public.courses WHERE title = pillar_titles[i] LIMIT 1;
    IF cid IS NULL THEN
      INSERT INTO public.courses (title, description, status, thumbnail_url, created_by)
      VALUES (pillar_titles[i], pillar_descs[i], 'published', pillar_thumbs[i], ceo_uid)
      RETURNING id INTO cid;
    END IF;
    course_ids := course_ids || cid;

    -- 3 sections per course
    FOR sec_i IN 1..3 LOOP
      SELECT id INTO sid FROM public.sections WHERE course_id = cid AND position = sec_i LIMIT 1;
      IF sid IS NULL THEN
        INSERT INTO public.sections (course_id, title, position)
        VALUES (cid, section_titles[sec_i], sec_i)
        RETURNING id INTO sid;

        -- 5 lessons per section: video, video, pdf, quiz, practical
        INSERT INTO public.lessons (section_id, title, type, position, duration_seconds, content) VALUES
          (sid, 'Intro lecture — '||section_titles[sec_i], 'video', 1, 360,
            jsonb_build_object('video_url', sample_video, 'storage_path', null)),
          (sid, 'Walkthrough demo', 'video', 2, 480,
            jsonb_build_object('video_url', sample_video, 'storage_path', null)),
          (sid, 'Reference cheatsheet', 'pdf', 3, null,
            jsonb_build_object('pdf_url', sample_pdf, 'storage_path', null)),
          (sid, 'Quick check quiz', 'quiz', 4, null,
            jsonb_build_object(
              'pass_score', 60,
              'questions', jsonb_build_array(
                jsonb_build_object(
                  'q','What is the most important thing to lock down before opening the editor?',
                  'options', jsonb_build_array('A nice transition','Understanding the brief and intent','A trendy font','Color LUTs'),
                  'correct', 1
                ),
                jsonb_build_object(
                  'q','Which export codec is best for a client master deliverable?',
                  'options', jsonb_build_array('H.264 1080p','GIF','ProRes','WebM'),
                  'correct', 2
                ),
                jsonb_build_object(
                  'q','When should you add background music to a talking-head edit?',
                  'options', jsonb_build_array('Always at full volume','Never','Ducked under the dialogue','Only at the end'),
                  'correct', 2
                )
              )
            )),
          (sid, 'Benchmark practical', 'practical', 5, null,
            jsonb_build_object(
              'brief','Apply what you learned in this section. Submit a short export (max 60s) demonstrating the technique. Your franchise incharge will review and grade.'
            ));
      END IF;
    END LOOP;
  END LOOP;

  -- ============ Assignments: all 12 courses → all 21 members ============
  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NULL THEN CONTINUE; END IF;
    FOREACH cid IN ARRAY course_ids LOOP
      INSERT INTO public.assignments (user_id, course_id, priority, deadline, assigned_by)
      SELECT uid, cid,
        CASE WHEN (i + array_position(course_ids, cid)) % 2 = 0
             THEN 'mandatory'::assignment_priority
             ELSE 'recommended'::assignment_priority END,
        CASE WHEN (i + array_position(course_ids, cid)) % 3 = 0
             THEN now() + ((array_position(course_ids, cid) * 7) || ' days')::interval
             ELSE NULL END,
        ceo_uid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.assignments a WHERE a.user_id = uid AND a.course_id = cid
      );
    END LOOP;
  END LOOP;

  -- ============ Lesson progress ============
  -- Members 1-5: ~80% across first 4 courses
  -- Members 6-10: ~40% on first 2 courses
  -- Members 11-20: 0-20% on first course only
  -- you@: 60% across first 4 courses
  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NULL THEN CONTINUE; END IF;

    DECLARE
      target_courses int;
      pct numeric;
    BEGIN
      IF i <= 5 THEN target_courses := 4; pct := 0.80;
      ELSIF i <= 10 THEN target_courses := 2; pct := 0.40;
      ELSIF i <= 20 THEN target_courses := 1; pct := 0.15 + (i % 3) * 0.05;
      ELSE target_courses := 4; pct := 0.60; -- you@
      END IF;

      FOR ci IN 1..target_courses LOOP
        cid := course_ids[ci];
        SELECT array_agg(l.id ORDER BY s.position, l.position) INTO lesson_ids
        FROM public.lessons l
        JOIN public.sections s ON s.id = l.section_id
        WHERE s.course_id = cid;

        total_lessons := array_length(lesson_ids, 1);
        done_target := GREATEST(1, FLOOR(total_lessons * pct)::int);

        FOR li IN 1..done_target LOOP
          lid := lesson_ids[li];
          INSERT INTO public.lesson_progress (user_id, lesson_id, completed, progress_percent, completed_at)
          VALUES (uid, lid, true, 100, now() - ((30 - li) || ' hours')::interval)
          ON CONFLICT (user_id, lesson_id) DO NOTHING;
        END LOOP;
      END LOOP;
    END;
  END LOOP;

  -- ============ Submissions (practical lessons) ============
  -- Add a few graded + pending submissions to light up the Incharge queue.

  -- Helper inline: pick a practical lesson id from a given course
  -- Member 1 → approved on course 1
  SELECT id INTO uid FROM auth.users WHERE email = 'member01@irmacademy.test';
  SELECT l.id INTO lid FROM public.lessons l
    JOIN public.sections s ON s.id = l.section_id
    WHERE s.course_id = course_ids[1] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
  IF uid IS NOT NULL AND lid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.submissions WHERE user_id = uid AND lesson_id = lid
  ) THEN
    INSERT INTO public.submissions (user_id, lesson_id, file_url, status, grade, feedback, reviewed_by, reviewed_at)
    VALUES (uid, lid, 'https://example.com/demo-submission-01.mp4', 'approved', 91,
      'Excellent work — pacing felt natural and the export settings were correct.',
      in_sar, now() - interval '2 days');
  END IF;

  -- Member 2 → approved on course 2
  SELECT id INTO uid FROM auth.users WHERE email = 'member02@irmacademy.test';
  SELECT l.id INTO lid FROM public.lessons l
    JOIN public.sections s ON s.id = l.section_id
    WHERE s.course_id = course_ids[2] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
  IF uid IS NOT NULL AND lid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.submissions WHERE user_id = uid AND lesson_id = lid
  ) THEN
    INSERT INTO public.submissions (user_id, lesson_id, file_url, status, grade, feedback, reviewed_by, reviewed_at)
    VALUES (uid, lid, 'https://example.com/demo-submission-02.mp4', 'approved', 78,
      'Good understanding. Tighten the captions next time — a few timing slips.',
      in_lah, now() - interval '5 days');
  END IF;

  -- Member 6 → pending on course 1 (Sargodha incharge sees this)
  SELECT id INTO uid FROM auth.users WHERE email = 'member06@irmacademy.test';
  SELECT l.id INTO lid FROM public.lessons l
    JOIN public.sections s ON s.id = l.section_id
    WHERE s.course_id = course_ids[1] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
  IF uid IS NOT NULL AND lid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.submissions WHERE user_id = uid AND lesson_id = lid
  ) THEN
    INSERT INTO public.submissions (user_id, lesson_id, file_url, status)
    VALUES (uid, lid, 'https://example.com/demo-submission-06.mp4', 'pending');
  END IF;

  -- Member 7 → pending on course 3
  SELECT id INTO uid FROM auth.users WHERE email = 'member07@irmacademy.test';
  SELECT l.id INTO lid FROM public.lessons l
    JOIN public.sections s ON s.id = l.section_id
    WHERE s.course_id = course_ids[3] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
  IF uid IS NOT NULL AND lid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.submissions WHERE user_id = uid AND lesson_id = lid
  ) THEN
    INSERT INTO public.submissions (user_id, lesson_id, file_url, status)
    VALUES (uid, lid, 'https://example.com/demo-submission-07.mp4', 'pending');
  END IF;

  -- Member 8 → revision on course 4
  SELECT id INTO uid FROM auth.users WHERE email = 'member08@irmacademy.test';
  SELECT l.id INTO lid FROM public.lessons l
    JOIN public.sections s ON s.id = l.section_id
    WHERE s.course_id = course_ids[4] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
  IF uid IS NOT NULL AND lid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.submissions WHERE user_id = uid AND lesson_id = lid
  ) THEN
    INSERT INTO public.submissions (user_id, lesson_id, file_url, status, feedback, reviewed_by, reviewed_at)
    VALUES (uid, lid, 'https://example.com/demo-submission-08.mp4', 'revision',
      'Cuts feel mechanical. Re-edit holding shots 30% longer where the speaker emphasises a point.',
      in_lah, now() - interval '1 day');
  END IF;

  -- you@ → 1 approved, 1 revision, 1 pending
  SELECT id INTO you_uid FROM auth.users WHERE email = 'you@irmacademy.test';
  IF you_uid IS NOT NULL THEN
    -- approved (course 1)
    SELECT l.id INTO lid FROM public.lessons l
      JOIN public.sections s ON s.id = l.section_id
      WHERE s.course_id = course_ids[1] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
    IF NOT EXISTS (SELECT 1 FROM public.submissions WHERE user_id = you_uid AND lesson_id = lid) THEN
      INSERT INTO public.submissions (user_id, lesson_id, file_url, status, grade, feedback, reviewed_by, reviewed_at)
      VALUES (you_uid, lid, 'https://example.com/you-submission-1.mp4', 'approved', 88,
        'Very clean — your shortcut speed was visible. Keep going.',
        in_sar, now() - interval '4 days');
    END IF;
    -- revision (course 2)
    SELECT l.id INTO lid FROM public.lessons l
      JOIN public.sections s ON s.id = l.section_id
      WHERE s.course_id = course_ids[2] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
    IF NOT EXISTS (SELECT 1 FROM public.submissions WHERE user_id = you_uid AND lesson_id = lid) THEN
      INSERT INTO public.submissions (user_id, lesson_id, file_url, status, feedback, reviewed_by, reviewed_at)
      VALUES (you_uid, lid, 'https://example.com/you-submission-2.mp4', 'revision',
        'Good intent but the brief asked to PERSUADE — your edit informs. Re-cut for emotional pull.',
        in_sar, now() - interval '1 day');
    END IF;
    -- pending (course 3)
    SELECT l.id INTO lid FROM public.lessons l
      JOIN public.sections s ON s.id = l.section_id
      WHERE s.course_id = course_ids[3] AND l.type = 'practical' ORDER BY s.position, l.position LIMIT 1;
    IF NOT EXISTS (SELECT 1 FROM public.submissions WHERE user_id = you_uid AND lesson_id = lid) THEN
      INSERT INTO public.submissions (user_id, lesson_id, file_url, status)
      VALUES (you_uid, lid, 'https://example.com/you-submission-3.mp4', 'pending');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'franchises', 3,
    'courses', array_length(course_ids, 1),
    'members', 21,
    'status', 'ok'
  );
END;
$$;

-- Add unique constraint on lesson_progress (user_id, lesson_id) so ON CONFLICT works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_progress_user_lesson_unique'
  ) THEN
    ALTER TABLE public.lesson_progress
      ADD CONSTRAINT lesson_progress_user_lesson_unique UNIQUE (user_id, lesson_id);
  END IF;
END $$;

-- Restrict execution: only service_role can call this seeder
REVOKE ALL ON FUNCTION public.seed_demo_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_content() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_content() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_content() TO service_role;
