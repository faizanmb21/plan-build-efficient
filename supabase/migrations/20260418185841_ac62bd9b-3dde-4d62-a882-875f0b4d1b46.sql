
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('ceo', 'incharge', 'member');
CREATE TYPE public.course_status AS ENUM ('draft', 'published');
CREATE TYPE public.lesson_type AS ENUM ('video', 'pdf', 'quiz', 'practical');
CREATE TYPE public.assignment_priority AS ENUM ('mandatory', 'recommended');
CREATE TYPE public.submission_status AS ENUM ('pending', 'approved', 'revision');

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.franchises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  manager_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  franchise_id UUID REFERENCES public.franchises(id) ON DELETE SET NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  franchise_id UUID REFERENCES public.franchises(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  franchise_id UUID REFERENCES public.franchises(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at TIMESTAMPTZ,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  status public.course_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type public.lesson_type NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  last_position INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  priority public.assignment_priority NOT NULL DEFAULT 'mandatory',
  deadline TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(course_id, user_id)
);

CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  status public.submission_status NOT NULL DEFAULT 'pending',
  grade INTEGER,
  feedback TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_profiles_franchise ON public.profiles(franchise_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_sections_course ON public.sections(course_id, position);
CREATE INDEX idx_lessons_section ON public.lessons(section_id, position);
CREATE INDEX idx_progress_user ON public.lesson_progress(user_id);
CREATE INDEX idx_assignments_user ON public.assignments(user_id);
CREATE INDEX idx_submissions_status ON public.submissions(status, created_at);

-- ============================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_franchise(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT franchise_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Bootstrap: claim CEO role if none exists yet
CREATE OR REPLACE FUNCTION public.claim_first_ceo()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ceo_count INTEGER;
  current_uid UUID;
BEGIN
  current_uid := auth.uid();
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT COUNT(*) INTO ceo_count FROM public.user_roles WHERE role = 'ceo';
  IF ceo_count > 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (current_uid, 'ceo')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN TRUE;
END;
$$;

-- Accept invite
CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invites%ROWTYPE;
  current_uid UUID;
BEGIN
  current_uid := auth.uid();
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT * INTO inv FROM public.invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;

  INSERT INTO public.user_roles (user_id, role, franchise_id)
  VALUES (current_uid, inv.role, inv.franchise_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles SET franchise_id = inv.franchise_id WHERE id = current_uid;
  UPDATE public.invites SET accepted_at = now() WHERE id = inv.id;

  RETURN jsonb_build_object('role', inv.role, 'franchise_id', inv.franchise_id);
END;
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.franchises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES
-- ============================================================

-- franchises
CREATE POLICY "ceo all franchises" ON public.franchises FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "members read own franchise" ON public.franchises FOR SELECT
  USING (id = public.get_user_franchise(auth.uid()));

-- profiles
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "ceo all profiles" ON public.profiles FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "incharge read franchise profiles" ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'incharge') AND franchise_id = public.get_user_franchise(auth.uid()));

-- user_roles
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ceo manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));

-- invites
CREATE POLICY "ceo manage invites" ON public.invites FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));

-- courses
CREATE POLICY "ceo all courses" ON public.courses FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "authenticated read published courses" ON public.courses FOR SELECT
  TO authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'ceo'));

-- sections
CREATE POLICY "ceo all sections" ON public.sections FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "authenticated read sections" ON public.sections FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND (c.status = 'published' OR public.has_role(auth.uid(), 'ceo')))
  );

-- lessons
CREATE POLICY "ceo all lessons" ON public.lessons FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "authenticated read lessons" ON public.lessons FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sections s
      JOIN public.courses c ON c.id = s.course_id
      WHERE s.id = section_id AND (c.status = 'published' OR public.has_role(auth.uid(), 'ceo'))
    )
  );

-- lesson_progress
CREATE POLICY "users own progress" ON public.lesson_progress FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ceo read all progress" ON public.lesson_progress FOR SELECT
  USING (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "incharge read franchise progress" ON public.lesson_progress FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.franchise_id = public.get_user_franchise(auth.uid()))
  );

-- assignments
CREATE POLICY "ceo all assignments" ON public.assignments FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "users read own assignments" ON public.assignments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "incharge read franchise assignments" ON public.assignments FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.franchise_id = public.get_user_franchise(auth.uid()))
  );

-- submissions
CREATE POLICY "users own submissions insert" ON public.submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users read own submissions" ON public.submissions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ceo all submissions" ON public.submissions FOR ALL
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "incharge franchise submissions read" ON public.submissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'incharge')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.franchise_id = public.get_user_franchise(auth.uid()))
  );
CREATE POLICY "incharge franchise submissions update" ON public.submissions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'incharge')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.franchise_id = public.get_user_franchise(auth.uid()))
  );

-- Allow anyone to read invite by token (for accept page) — token is the secret
CREATE POLICY "public read invite by token" ON public.invites FOR SELECT USING (true);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('thumbnails', 'thumbnails', true),
  ('course-content', 'course-content', false),
  ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;

-- thumbnails: public read, CEO write
CREATE POLICY "thumbnails public read" ON storage.objects FOR SELECT USING (bucket_id = 'thumbnails');
CREATE POLICY "thumbnails ceo write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "thumbnails ceo update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "thumbnails ceo delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'ceo'));

-- course-content: authenticated read (signed URLs), CEO write
CREATE POLICY "course-content auth read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'course-content');
CREATE POLICY "course-content ceo write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'course-content' AND public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "course-content ceo update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'course-content' AND public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "course-content ceo delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'course-content' AND public.has_role(auth.uid(), 'ceo'));

-- submissions: users write own (in folder named user_id), incharge/ceo read
CREATE POLICY "submissions own write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "submissions own read" ON storage.objects FOR SELECT
  USING (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "submissions ceo read" ON storage.objects FOR SELECT
  USING (bucket_id = 'submissions' AND public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "submissions incharge read" ON storage.objects FOR SELECT
  USING (bucket_id = 'submissions' AND public.has_role(auth.uid(), 'incharge'));
