CREATE OR REPLACE FUNCTION public.reset_seed_passwords()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE auth.users
  SET encrypted_password = extensions.crypt('password123', extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE email LIKE '%@irmacademy.test';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

SELECT public.reset_seed_passwords();
DROP FUNCTION public.reset_seed_passwords();