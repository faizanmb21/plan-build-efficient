-- 1. Schema changes
ALTER TABLE public.franchises
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_delete_at TIMESTAMPTZ;

-- 2. Archive (soft-delete) function
CREATE OR REPLACE FUNCTION public.archive_franchise(_franchise_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID;
BEGIN
  current_uid := auth.uid();
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF NOT public.has_role(current_uid, 'ceo'::app_role) THEN
    RAISE EXCEPTION 'Only CEO can archive a franchise';
  END IF;

  UPDATE public.franchises
    SET archived_at = now(),
        auto_delete_at = now() + interval '30 days',
        manager_id = NULL,
        updated_at = now()
    WHERE id = _franchise_id;

  -- Detach members from this franchise (keep them in the system)
  UPDATE public.profiles SET franchise_id = NULL WHERE franchise_id = _franchise_id;
  UPDATE public.user_roles SET franchise_id = NULL WHERE franchise_id = _franchise_id;

  RETURN jsonb_build_object('ok', true, 'archived_at', now(), 'purge_after', now() + interval '30 days');
END;
$$;

-- 3. Restore (undo archive)
CREATE OR REPLACE FUNCTION public.restore_franchise(_franchise_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'Only CEO can restore a franchise';
  END IF;

  UPDATE public.franchises
    SET archived_at = NULL, auto_delete_at = NULL, updated_at = now()
    WHERE id = _franchise_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. Purge (hard delete) — only if archived ≥ 30 days OR force flag passed
CREATE OR REPLACE FUNCTION public.purge_franchise(_franchise_id UUID, _force BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'Only CEO can purge a franchise';
  END IF;

  SELECT archived_at INTO archived FROM public.franchises WHERE id = _franchise_id;
  IF archived IS NULL THEN
    RAISE EXCEPTION 'Franchise must be archived before purging';
  END IF;
  IF NOT _force AND archived > now() - interval '30 days' THEN
    RAISE EXCEPTION 'Franchise can only be purged 30 days after archiving';
  END IF;

  -- Detach anything still pointing here (defensive — archive should already have done this)
  UPDATE public.profiles SET franchise_id = NULL WHERE franchise_id = _franchise_id;
  UPDATE public.user_roles SET franchise_id = NULL WHERE franchise_id = _franchise_id;
  DELETE FROM public.invites WHERE franchise_id = _franchise_id;
  DELETE FROM public.franchises WHERE id = _franchise_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;