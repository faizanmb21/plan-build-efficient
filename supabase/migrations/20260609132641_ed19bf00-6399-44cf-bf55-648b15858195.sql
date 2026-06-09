DROP POLICY IF EXISTS "incharge read franchise member roles" ON public.user_roles;
CREATE POLICY "incharge read franchise member roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  role = 'member'::public.app_role
  AND public.has_role(auth.uid(), 'incharge'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND p.franchise_id = public.get_user_franchise(auth.uid())
  )
);