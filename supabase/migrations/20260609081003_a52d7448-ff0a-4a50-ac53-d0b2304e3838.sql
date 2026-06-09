ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_start_time time;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_end_time time;