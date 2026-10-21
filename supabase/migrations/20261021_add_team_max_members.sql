-- Add per-team capacity to existing deployments. Existing teams keep a capacity of four.
ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS max_members INT NOT NULL DEFAULT 4;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'teams_max_members_check'
          AND conrelid = 'public.teams'::regclass
    ) THEN
        ALTER TABLE public.teams
            ADD CONSTRAINT teams_max_members_check CHECK (max_members BETWEEN 1 AND 100);
    END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO service_role;
NOTIFY pgrst, 'reload schema';
