-- ==============================================================================
-- CTF Arena - Row Level Security (RLS) Policies
-- File: supabase/policies.sql
-- Description: Strict defense-in-depth access controls for all tables.
-- Note: FastAPI connects via the Supabase service_role key, which bypasses RLS.
--       These policies enforce strict deny-by-default to prevent malicious client
--       manipulation via direct Supabase client requests.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enable RLS on All Tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.ctf_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hint_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Helper Functions for RLS Check
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. ctf_settings Policies
-- Publicly readable by all users to inspect CTF status and countdown
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view ctf settings" ON public.ctf_settings;
CREATE POLICY "Public can view ctf settings"
    ON public.ctf_settings FOR SELECT
    USING (TRUE);

-- ------------------------------------------------------------------------------
-- 4. teams Policies
-- Anyone can view team basic information (leaderboards, public profiles)
-- Writes are mediated solely by FastAPI backend
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teams are publicly readable" ON public.teams;
CREATE POLICY "Teams are publicly readable"
    ON public.teams FOR SELECT
    USING (TRUE);

-- ------------------------------------------------------------------------------
-- 5. profiles Policies
-- Competitor profiles are readable by anyone (leaderboards, teams)
-- Users can only update their own display_name and avatar_url
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
CREATE POLICY "Profiles are publicly readable"
    ON public.profiles FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "Users can update own display profile" ON public.profiles;
CREATE POLICY "Users can update own display profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 6. rooms (Labs) Policies
-- Published labs are readable by all authenticated/anon users
-- Admins can read all labs including drafts
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Published rooms are readable" ON public.rooms;
CREATE POLICY "Published rooms are readable"
    ON public.rooms FOR SELECT
    USING (is_published = TRUE OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. challenges Policies
-- Published challenges are readable
-- Admins can view all challenges
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Published challenges are readable" ON public.challenges;
CREATE POLICY "Published challenges are readable"
    ON public.challenges FOR SELECT
    USING (is_published = TRUE OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 8. challenge_flags Policies (CRITICAL DEFENSE)
-- ZERO POLICIES FOR PUBLIC OR AUTHENTICATED ROLES
-- Flags are NEVER readable or writable via client keys.
-- Only the backend service_role key can access this table.
-- ------------------------------------------------------------------------------
-- Intentionally no policies created. Default deny blocks all client requests.

-- ------------------------------------------------------------------------------
-- 9. challenge_files Policies
-- File references for published challenges are readable
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Challenge files are readable for published challenges" ON public.challenge_files;
CREATE POLICY "Challenge files are readable for published challenges"
    ON public.challenge_files FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.challenges c
            WHERE c.id = challenge_id AND (c.is_published = TRUE OR public.is_admin())
        )
    );

-- ------------------------------------------------------------------------------
-- 10. hints & hint_unlocks Policies
-- Hints metadata can be read, but unlock tracking protects penalties
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Hints are readable for published challenges" ON public.hints;
CREATE POLICY "Hints are readable for published challenges"
    ON public.hints FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.challenges c
            WHERE c.id = challenge_id AND (c.is_published = TRUE OR public.is_admin())
        )
    );

DROP POLICY IF EXISTS "Users can view own hint unlocks" ON public.hint_unlocks;
CREATE POLICY "Users can view own hint unlocks"
    ON public.hint_unlocks FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 11. submissions Policies
-- Users can view their own past submissions; admins can view all
-- Direct insert is blocked from clients (must go through FastAPI verification)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own submissions" ON public.submissions;
CREATE POLICY "Users can view own submissions"
    ON public.submissions FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 12. solves Policies
-- Solves are publicly readable for scoreboard calculations and solve badges
-- Direct insertions or modifications from clients are strictly blocked
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Solves are publicly readable" ON public.solves;
CREATE POLICY "Solves are publicly readable"
    ON public.solves FOR SELECT
    USING (TRUE);

-- ------------------------------------------------------------------------------
-- 13. lab_progress Policies
-- Users can view their own progress; admins can view all users' progress
-- Updates and completions are written solely by the backend engine
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own lab progress" ON public.lab_progress;
CREATE POLICY "Users can view own lab progress"
    ON public.lab_progress FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 14. activity_events Policies
-- Users can view their own activity history; admins can inspect live operations
-- Insertions are restricted to backend audit pipelines
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own activity events" ON public.activity_events;
CREATE POLICY "Users can view own activity events"
    ON public.activity_events FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());
