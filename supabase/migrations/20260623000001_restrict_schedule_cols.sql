-- Members must not be able to update their own schedule fields directly via the API.
-- CEO/Incharge updates go through server functions that use service_role, which bypasses this.
-- Revoking column-level UPDATE from the authenticated role is the cleanest enforcement.
REVOKE UPDATE (expected_daily_hours, work_start_time, work_end_time, working_days)
  ON public.profiles
  FROM authenticated;
