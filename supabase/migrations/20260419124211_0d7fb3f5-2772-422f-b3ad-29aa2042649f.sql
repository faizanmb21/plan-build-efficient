-- 1. Allow incharges to manage invites for THEIR franchise, members only
CREATE POLICY "incharge invite members in own franchise"
ON public.invites
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'incharge'::app_role)
  AND role = 'member'::app_role
  AND franchise_id = get_user_franchise(auth.uid())
  AND franchise_id IS NOT NULL
);

CREATE POLICY "incharge read own franchise invites"
ON public.invites
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'incharge'::app_role)
  AND franchise_id = get_user_franchise(auth.uid())
);

CREATE POLICY "incharge revoke own franchise invites"
ON public.invites
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'incharge'::app_role)
  AND franchise_id = get_user_franchise(auth.uid())
  AND accepted_at IS NULL
);

-- 2. Soft-remove a member from a franchise (incharge or CEO)
CREATE OR REPLACE FUNCTION public.remove_member_from_franchise(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid;
  caller_franchise uuid;
  target_franchise uuid;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT franchise_id INTO target_franchise FROM public.profiles WHERE id = _user_id;

  -- CEO can remove anyone
  IF public.has_role(caller, 'ceo'::app_role) THEN
    NULL;
  ELSIF public.has_role(caller, 'incharge'::app_role) THEN
    caller_franchise := public.get_user_franchise(caller);
    IF caller_franchise IS NULL OR target_franchise IS NULL OR caller_franchise <> target_franchise THEN
      RAISE EXCEPTION 'Incharge can only remove members from their own franchise';
    END IF;
    -- Don't let incharge remove a CEO or another incharge
    IF public.has_role(_user_id, 'ceo'::app_role) OR public.has_role(_user_id, 'incharge'::app_role) THEN
      RAISE EXCEPTION 'Cannot remove a CEO or incharge';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles SET franchise_id = NULL WHERE id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'member'::app_role;

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id);
END;
$$;