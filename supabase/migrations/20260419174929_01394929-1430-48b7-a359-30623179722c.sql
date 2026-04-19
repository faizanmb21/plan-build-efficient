-- 1) RPC: get emails for franchise members (CEO or that franchise's incharge only)
CREATE OR REPLACE FUNCTION public.get_franchise_member_emails(_franchise_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT (
    public.has_role(caller, 'ceo'::app_role)
    OR (public.has_role(caller, 'incharge'::app_role)
        AND public.get_user_franchise(caller) = _franchise_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to read franchise members';
  END IF;

  RETURN QUERY
  SELECT p.id AS user_id, u.email::text AS email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.franchise_id = _franchise_id;
END;
$$;

-- 2) RLS: allow incharge to insert + delete assignments for members of own franchise
CREATE POLICY "incharge insert franchise assignments"
ON public.assignments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'incharge'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = assignments.user_id
      AND p.franchise_id = public.get_user_franchise(auth.uid())
  )
);

CREATE POLICY "incharge delete franchise assignments"
ON public.assignments
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'incharge'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = assignments.user_id
      AND p.franchise_id = public.get_user_franchise(auth.uid())
  )
);

-- 3) Extend the demo seeder so attendance data exists out of the box
CREATE OR REPLACE FUNCTION public.seed_demo_content()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  practical_lessons uuid[];
  pl uuid;
  member_incharge uuid;
  member_franchise uuid;
  bucket int;
  letter text;
  num_grade int;
  fb text;
  feedback_aplus text[] := ARRAY[
    'Outstanding work — every cut felt deliberate and the export was flawless.',
    'Top tier. Pacing, sound, and color all hit the brief perfectly.',
    'A+ effort. This is the standard the rest of the team should be matching.',
    'Brilliant — your understanding of rhythm and intent is showing through.',
    'Exceptional execution. Captions were spot on and the audio mix was clean.',
    'Pristine. Honestly hard to find anything to improve here.',
    'Masterful. Your storyboarding instincts are getting sharp.',
    'Phenomenal — bookmarking this as a reference for the next batch.'
  ];
  feedback_a text[] := ARRAY[
    'Strong work. Pacing was natural and the export settings were correct.',
    'Solid edit. A few caption timings were slightly off but nothing major.',
    'Good — color grading was consistent across all clips. Keep it up.',
    'Nice rhythm and clean cuts. Tighten the intro by ~2 seconds next time.',
    'Well done. Audio levels balanced, sound design tasteful.',
    'Confident execution. Could push the motion graphics a touch further.',
    'Good understanding of the brief. Watch your text hierarchy on lower thirds.',
    'Solid. The B-roll selection elevated the talking head significantly.'
  ];
  feedback_b text[] := ARRAY[
    'Acceptable but feels mechanical — try holding shots 30% longer where the speaker emphasises.',
    'Got the basics right. Captions had 3 timing slips and a typo. Be careful.',
    'Decent edit. Color is inconsistent across clips — apply a unified LUT.',
    'Workable but the audio mix is muddy in the second half.',
    'Passable. Typography choices clash with the brand palette.',
    'OK — the export codec was fine but file size is way too large for delivery.',
    'It works but the pacing drags between 0:20 and 0:40. Re-cut that section.',
    'Meets the brief minimally. Try adding one motion accent to lift the energy.'
  ];
  feedback_c text[] := ARRAY[
    'Needs a redo. The brief asked to PERSUADE — your edit only INFORMS. Re-cut for emotional pull.',
    'Please resubmit. Captions are out of sync in 6+ places and the audio peaks are clipping.',
    'Redo required. Export settings are wrong (delivered as GIF instead of H.264 1080p).',
    'Resubmission needed — three obvious typos in the lower thirds and inconsistent fonts.',
    'Please redo. The pacing is jarring and there is no clear narrative arc.',
    'Needs another pass. Color is unmatched between clips and the white balance is off in clip 3.',
    'Redo — the assignment asked for a 60s short but you delivered 2:14. Stick to the brief.',
    'Resubmit please. The brief attachment was not addressed at all in this edit.'
  ];

  attempt_idx int;
  pillar_idx int;
  pl_idx int;
  total_practical int;
  sec_i int;
  ci int;

  -- attendance vars
  day_offset int;
  sess_per_day int;
  s_idx int;
  sess_start timestamptz;
  sess_active int;
  sess_idle int;
  sess_blur int;
  sess_end timestamptz;
  new_sess_id uuid;
  rand_seed int;
BEGIN
  SELECT id INTO ceo_uid FROM auth.users WHERE email = 'ceo@irmacademy.test';
  SELECT id INTO in_sar FROM auth.users WHERE email = 'incharge.sargodha@irmacademy.test';
  SELECT id INTO in_lah FROM auth.users WHERE email = 'incharge.lahore@irmacademy.test';
  SELECT id INTO in_pdk FROM auth.users WHERE email = 'incharge.pdk@irmacademy.test';
  SELECT id INTO you_uid FROM auth.users WHERE email = 'you@irmacademy.test';

  IF ceo_uid IS NULL OR in_sar IS NULL OR in_lah IS NULL OR in_pdk IS NULL THEN
    RAISE EXCEPTION 'Auth users not found. Run the seed server function first.';
  END IF;

  INSERT INTO public.franchises (name, location) VALUES ('IRM Sargodha','Sargodha, Pakistan') ON CONFLICT DO NOTHING;
  INSERT INTO public.franchises (name, location) VALUES ('IRM Lahore','Lahore, Pakistan') ON CONFLICT DO NOTHING;
  INSERT INTO public.franchises (name, location) VALUES ('IRM PDK','Pindi, Pakistan') ON CONFLICT DO NOTHING;

  SELECT id INTO f_sargodha FROM public.franchises WHERE name = 'IRM Sargodha' LIMIT 1;
  SELECT id INTO f_lahore FROM public.franchises WHERE name = 'IRM Lahore' LIMIT 1;
  SELECT id INTO f_pdk FROM public.franchises WHERE name = 'IRM PDK' LIMIT 1;

  UPDATE public.franchises SET manager_id = in_sar WHERE id = f_sargodha;
  UPDATE public.franchises SET manager_id = in_lah WHERE id = f_lahore;
  UPDATE public.franchises SET manager_id = in_pdk WHERE id = f_pdk;

  INSERT INTO public.user_roles (user_id, role) VALUES (ceo_uid, 'ceo') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (in_sar, 'incharge', f_sargodha) ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;
  INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (in_lah, 'incharge', f_lahore) ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;
  INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (in_pdk, 'incharge', f_pdk) ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;

  UPDATE public.profiles SET full_name = 'Imran Iqbal (CEO)' WHERE id = ceo_uid;
  UPDATE public.profiles SET full_name = 'Sargodha Incharge', franchise_id = f_sargodha WHERE id = in_sar;
  UPDATE public.profiles SET full_name = 'Lahore Incharge', franchise_id = f_lahore WHERE id = in_lah;
  UPDATE public.profiles SET full_name = 'PDK Incharge', franchise_id = f_pdk WHERE id = in_pdk;

  member_franchises := ARRAY[
    f_sargodha,f_lahore,f_pdk,f_sargodha,f_lahore,
    f_pdk,f_sargodha,f_lahore,f_pdk,f_sargodha,
    f_lahore,f_pdk,f_sargodha,f_lahore,f_pdk,
    f_sargodha,f_lahore,f_pdk,f_sargodha,f_lahore,
    f_sargodha
  ];

  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NOT NULL THEN
      UPDATE public.profiles SET full_name = member_names[i], franchise_id = member_franchises[i] WHERE id = uid;
      INSERT INTO public.user_roles (user_id, role, franchise_id) VALUES (uid, 'member', member_franchises[i])
      ON CONFLICT (user_id, role) DO UPDATE SET franchise_id = EXCLUDED.franchise_id;
    END IF;
  END LOOP;

  course_ids := ARRAY[]::uuid[];
  FOR i IN 1..12 LOOP
    SELECT id INTO cid FROM public.courses WHERE title = pillar_titles[i] LIMIT 1;
    IF cid IS NULL THEN
      INSERT INTO public.courses (title, description, status, thumbnail_url, created_by)
      VALUES (pillar_titles[i], pillar_descs[i], 'published', pillar_thumbs[i], ceo_uid)
      RETURNING id INTO cid;
    END IF;
    course_ids := course_ids || cid;

    FOR sec_i IN 1..3 LOOP
      SELECT id INTO sid FROM public.sections WHERE course_id = cid AND position = sec_i LIMIT 1;
      IF sid IS NULL THEN
        INSERT INTO public.sections (course_id, title, position) VALUES (cid, section_titles[sec_i], sec_i) RETURNING id INTO sid;

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
                jsonb_build_object('q','What is the most important thing to lock down before opening the editor?','options', jsonb_build_array('A nice transition','Understanding the brief and intent','A trendy font','Color LUTs'),'correct', 1),
                jsonb_build_object('q','Which export codec is best for a client master deliverable?','options', jsonb_build_array('H.264 1080p','GIF','ProRes','WebM'),'correct', 2),
                jsonb_build_object('q','When should you add background music to a talking-head edit?','options', jsonb_build_array('Always at full volume','Never','Ducked under the dialogue','Only at the end'),'correct', 2)
              )
            )),
          (sid, 'Benchmark practical', 'practical', 5, null,
            jsonb_build_object('brief','Apply what you learned in this section. Submit a short export (max 60s) demonstrating the technique. Your franchise incharge will review and grade.'));
      END IF;
    END LOOP;
  END LOOP;

  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NULL THEN CONTINUE; END IF;
    FOREACH cid IN ARRAY course_ids LOOP
      INSERT INTO public.assignments (user_id, course_id, priority, deadline, assigned_by)
      SELECT uid, cid,
        CASE WHEN (i + array_position(course_ids, cid)) % 2 = 0 THEN 'mandatory'::assignment_priority ELSE 'recommended'::assignment_priority END,
        CASE WHEN (i + array_position(course_ids, cid)) % 3 = 0 THEN now() + ((array_position(course_ids, cid) * 7) || ' days')::interval ELSE NULL END,
        ceo_uid
      WHERE NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.user_id = uid AND a.course_id = cid);
    END LOOP;
  END LOOP;

  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NULL THEN CONTINUE; END IF;
    member_franchise := member_franchises[i];
    IF member_franchise = f_sargodha THEN member_incharge := in_sar;
    ELSIF member_franchise = f_lahore THEN member_incharge := in_lah;
    ELSE member_incharge := in_pdk;
    END IF;

    FOR pillar_idx IN 1..12 LOOP
      cid := course_ids[pillar_idx];
      SELECT array_agg(l.id ORDER BY s.position, l.position) INTO practical_lessons
        FROM public.lessons l JOIN public.sections s ON s.id = l.section_id
        WHERE s.course_id = cid AND l.type = 'practical';
      total_practical := COALESCE(array_length(practical_lessons, 1), 0);
      IF total_practical = 0 THEN CONTINUE; END IF;

      FOR attempt_idx IN 1..LEAST(3, total_practical) LOOP
        pl := practical_lessons[attempt_idx];

        IF EXISTS (SELECT 1 FROM public.submissions WHERE user_id = uid AND lesson_id = pl) THEN
          CONTINUE;
        END IF;

        bucket := ((i * 17) + (pillar_idx * 7) + (attempt_idx * 3)) % 100;
        IF bucket < 25 THEN letter := 'A+'; num_grade := 100;
          fb := feedback_aplus[1 + (bucket % array_length(feedback_aplus, 1))];
        ELSIF bucket < 65 THEN letter := 'A'; num_grade := 80;
          fb := feedback_a[1 + (bucket % array_length(feedback_a, 1))];
        ELSIF bucket < 85 THEN letter := 'B'; num_grade := 60;
          fb := feedback_b[1 + (bucket % array_length(feedback_b, 1))];
        ELSIF bucket < 95 THEN letter := 'C'; num_grade := NULL;
          fb := feedback_c[1 + (bucket % array_length(feedback_c, 1))];
        ELSE letter := NULL; num_grade := NULL; fb := NULL;
        END IF;

        IF letter IN ('A+','A','B') THEN
          INSERT INTO public.submissions
            (user_id, lesson_id, file_url, status, letter_grade, grade, feedback, reviewed_by, reviewed_at, created_at)
          VALUES
            (uid, pl, 'https://example.com/seed/'||uid||'/'||pl||'.mp4',
             'approved', letter, num_grade, fb, member_incharge,
             now() - ((bucket % 30) || ' days')::interval - ((attempt_idx * 4) || ' hours')::interval,
             now() - ((bucket % 30) + 1 || ' days')::interval);

          INSERT INTO public.lesson_progress (user_id, lesson_id, completed, progress_percent, completed_at)
          VALUES (uid, pl, true, 100, now() - ((bucket % 30) || ' days')::interval)
          ON CONFLICT (user_id, lesson_id) DO UPDATE SET
            completed = true, progress_percent = 100,
            completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);

        ELSIF letter = 'C' THEN
          INSERT INTO public.submissions
            (user_id, lesson_id, file_url, status, letter_grade, grade, feedback, reviewed_by, reviewed_at, created_at)
          VALUES
            (uid, pl, 'https://example.com/seed/'||uid||'/'||pl||'.mp4',
             'revision', 'C', NULL, fb, member_incharge,
             now() - ((bucket % 14) || ' days')::interval,
             now() - ((bucket % 14) + 1 || ' days')::interval);
        ELSE
          INSERT INTO public.submissions
            (user_id, lesson_id, file_url, status, created_at)
          VALUES
            (uid, pl, 'https://example.com/seed/'||uid||'/'||pl||'.mp4',
             'pending', now() - ((bucket % 5) || ' days')::interval);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NULL THEN CONTINUE; END IF;

    DECLARE
      target_courses int;
      pct numeric;
    BEGIN
      IF i <= 5 THEN target_courses := 6; pct := 0.85;
      ELSIF i <= 10 THEN target_courses := 4; pct := 0.55;
      ELSIF i <= 20 THEN target_courses := 3; pct := 0.30;
      ELSE target_courses := 6; pct := 0.70;
      END IF;

      FOR ci IN 1..target_courses LOOP
        cid := course_ids[ci];
        SELECT array_agg(l.id ORDER BY s.position, l.position) INTO lesson_ids
        FROM public.lessons l JOIN public.sections s ON s.id = l.section_id
        WHERE s.course_id = cid AND l.type <> 'practical';

        total_lessons := COALESCE(array_length(lesson_ids, 1), 0);
        done_target := GREATEST(1, FLOOR(total_lessons * pct)::int);

        FOR pl_idx IN 1..done_target LOOP
          lid := lesson_ids[pl_idx];
          INSERT INTO public.lesson_progress (user_id, lesson_id, completed, progress_percent, completed_at)
          VALUES (uid, lid, true, 100, now() - ((30 - pl_idx) || ' hours')::interval)
          ON CONFLICT (user_id, lesson_id) DO NOTHING;
        END LOOP;
      END LOOP;
    END;
  END LOOP;

  -- ============ Synthetic study sessions + attendance snapshots ============
  -- Skip if any sessions already exist for this member (idempotent reseed).
  FOR i IN 1..21 LOOP
    SELECT id INTO uid FROM auth.users WHERE email = member_emails[i];
    IF uid IS NULL THEN CONTINUE; END IF;

    IF EXISTS (SELECT 1 FROM public.study_sessions WHERE user_id = uid) THEN
      CONTINUE;
    END IF;

    rand_seed := (i * 13) + 7;

    FOR day_offset IN 0..6 LOOP
      -- 1–3 sessions per day, varied by member
      sess_per_day := 1 + ((rand_seed + day_offset * 5) % 3);

      FOR s_idx IN 1..sess_per_day LOOP
        -- start time = day_offset days ago, somewhere between 9am and 7pm
        sess_start := date_trunc('day', now() - (day_offset || ' days')::interval)
                      + ((9 + ((rand_seed + s_idx * 3 + day_offset) % 10)) || ' hours')::interval
                      + (((rand_seed * s_idx) % 60) || ' minutes')::interval;

        -- 20–80 min active, 2–15 min idle, 0–4 blurs
        sess_active := (20 + ((rand_seed + day_offset + s_idx * 7) % 60)) * 60;
        sess_idle := (2 + ((rand_seed + s_idx * 11) % 13)) * 60;
        sess_blur := (rand_seed + day_offset + s_idx) % 5;

        -- Most sessions ended; one in ~10 left "live" for today only
        IF day_offset = 0 AND s_idx = sess_per_day AND ((rand_seed + i) % 3 = 0) THEN
          sess_end := NULL;
        ELSE
          sess_end := sess_start + ((sess_active + sess_idle) || ' seconds')::interval;
        END IF;

        INSERT INTO public.study_sessions (
          user_id, started_at, ended_at, last_heartbeat_at,
          active_seconds, idle_seconds, blur_count, client_info
        ) VALUES (
          uid, sess_start, sess_end,
          COALESCE(sess_end, now() - ((rand_seed % 4) || ' minutes')::interval),
          sess_active, sess_idle, sess_blur,
          jsonb_build_object('seed', true, 'ua', 'Seeded/1.0')
        ) RETURNING id INTO new_sess_id;

        -- 1–2 attendance snapshots per session for today + yesterday
        IF day_offset <= 1 THEN
          INSERT INTO public.attendance_snapshots (user_id, session_id, kind, storage_path, captured_at)
          VALUES (uid, new_sess_id, 'periodic',
                  'seed/'||uid||'/'||day_offset||'-'||s_idx||'-a.jpg',
                  sess_start + ((sess_active / 4) || ' seconds')::interval);

          IF (rand_seed + s_idx) % 2 = 0 THEN
            INSERT INTO public.attendance_snapshots (user_id, session_id, kind, storage_path, captured_at)
            VALUES (uid, new_sess_id, 'periodic',
                    'seed/'||uid||'/'||day_offset||'-'||s_idx||'-b.jpg',
                    sess_start + ((sess_active / 2) || ' seconds')::interval);
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'franchises', 3,
    'courses', array_length(course_ids, 1),
    'members', 21,
    'status', 'ok'
  );
END;
$function$;