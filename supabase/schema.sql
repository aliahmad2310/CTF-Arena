-- ==============================================================================
-- CTF Arena - Database Schema
-- File: supabase/schema.sql
-- Description: Core schema, tables, triggers, and performance indexes.
-- Note: Strictly zero emoji in comments, identifiers, or string defaults.
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. CTF Global Settings (Single row configuration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ctf_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    title TEXT NOT NULL DEFAULT 'CTF Championship',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    freeze_leaderboard BOOLEAN NOT NULL DEFAULT FALSE,
    dynamic_scoring BOOLEAN NOT NULL DEFAULT FALSE,
    max_team_size INT NOT NULL DEFAULT 4 CHECK (max_team_size > 0),
    leaderboard_refresh_seconds INT NOT NULL DEFAULT 15 CHECK (leaderboard_refresh_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public homepage copy is served by FastAPI; only admin API writes it.
CREATE TABLE IF NOT EXISTS public.site_content (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    content JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. Teams Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE CHECK (char_length(name) >= 3 AND char_length(name) <= 30),
    invite_code TEXT NOT NULL UNIQUE CHECK (char_length(invite_code) >= 8),
    max_members INT NOT NULL DEFAULT 4 CHECK (max_members BETWEEN 1 AND 100),
    captain_id UUID, -- References profiles.id; circular FK resolved after profiles definition
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade existing deployments with a per-team capacity (existing teams retain the legacy default).
ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS max_members INT NOT NULL DEFAULT 4 CHECK (max_members BETWEEN 1 AND 100);

-- Enforce team capacity inside PostgreSQL as well as the API. Locking the team row
-- serializes competing joins and capacity changes, preventing a count-then-update race.
CREATE OR REPLACE FUNCTION public.enforce_team_member_capacity()
RETURNS TRIGGER AS $$
DECLARE
    capacity_limit INT;
    current_member_count INT;
BEGIN
    IF NEW.team_id IS NULL OR NEW.team_id IS NOT DISTINCT FROM OLD.team_id THEN
        RETURN NEW;
    END IF;

    SELECT max_members INTO capacity_limit
    FROM public.teams
    WHERE id = NEW.team_id
    FOR UPDATE;

    IF capacity_limit IS NULL THEN
        RAISE EXCEPTION 'Team does not exist';
    END IF;

    SELECT COUNT(*) INTO current_member_count
    FROM public.profiles
    WHERE team_id = NEW.team_id;

    IF current_member_count >= capacity_limit THEN
        RAISE EXCEPTION 'Team has reached its maximum size of % members', capacity_limit;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_team_capacity_not_below_members()
RETURNS TRIGGER AS $$
DECLARE
    current_member_count INT;
BEGIN
    IF NEW.max_members IS NOT DISTINCT FROM OLD.max_members THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO current_member_count
    FROM public.profiles
    WHERE team_id = NEW.id;

    IF current_member_count > NEW.max_members THEN
        RAISE EXCEPTION 'Team currently has % members; capacity cannot be lower', current_member_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS teams_capacity_not_below_members ON public.teams;
CREATE TRIGGER teams_capacity_not_below_members
    BEFORE UPDATE OF max_members ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.enforce_team_capacity_not_below_members();

-- ------------------------------------------------------------------------------
-- 3. Profiles Table (Linked to Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE CHECK (username ~* '^[a-zA-Z0-9_-]{3,20}$'),
    display_name TEXT NOT NULL CHECK (char_length(display_name) >= 2 AND char_length(display_name) <= 50),
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_room_id UUID, -- Updated via heartbeat
    current_challenge_id UUID, -- Updated via heartbeat
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS profiles_enforce_team_capacity ON public.profiles;
CREATE TRIGGER profiles_enforce_team_capacity
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_team_member_capacity();

-- Add foreign key constraint for teams.captain_id referencing profiles.id
ALTER TABLE public.teams 
    DROP CONSTRAINT IF EXISTS fk_teams_captain;
ALTER TABLE public.teams 
    ADD CONSTRAINT fk_teams_captain 
    FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 4. Rooms (Labs) Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 100),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~* '^[a-z0-9-]+$'),
    description TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Insane')),
    tags TEXT[] NOT NULL DEFAULT '{}',
    cover_image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for profiles.current_room_id
ALTER TABLE public.profiles 
    DROP CONSTRAINT IF EXISTS fk_profiles_current_room;
ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_current_room 
    FOREIGN KEY (current_room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 5. Challenges Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 120),
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('Web', 'Crypto', 'Forensics', 'Pwn', 'Reverse', 'OSINT', 'Stego', 'Misc')),
    points INT NOT NULL DEFAULT 100 CHECK (points >= 0),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Insane')),
    external_link TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for profiles.current_challenge_id
ALTER TABLE public.profiles 
    DROP CONSTRAINT IF EXISTS fk_profiles_current_challenge;
ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_current_challenge 
    FOREIGN KEY (current_challenge_id) REFERENCES public.challenges(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 6. Challenge Flags Table (Hashed and Salted; NEVER exposed to clients)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL UNIQUE REFERENCES public.challenges(id) ON DELETE CASCADE,
    flag_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_case_sensitive BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. Challenge Files Table (Storage references)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0 CHECK (file_size >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. Hints Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    cost INT NOT NULL DEFAULT 0 CHECK (cost >= 0),
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. Hint Unlocks Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hint_unlocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hint_id UUID NOT NULL REFERENCES public.hints(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    cost INT NOT NULL DEFAULT 0 CHECK (cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hint_unlock_user UNIQUE (hint_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 10. Submissions Table (Audit log of all flag attempts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    submitted_flag TEXT NOT NULL DEFAULT '',
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 11. Solves Table (Unique award records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.solves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    points_awarded INT NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
    is_first_blood BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_solve_user_challenge UNIQUE (challenge_id, user_id)
);

-- A team can earn points for a challenge only once, even if multiple members submit it together.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solve_team_challenge
    ON public.solves (challenge_id, team_id)
    WHERE team_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 12. Lab Progress Table (State tracking per user per lab)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    started_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    solved_count INT NOT NULL DEFAULT 0 CHECK (solved_count >= 0),
    total_count INT NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    points_earned INT NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_room_progress UNIQUE (user_id, room_id)
);

-- ------------------------------------------------------------------------------
-- 13. Activity Events Table (High-resolution live audit trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'login',
        'lab_opened',
        'challenge_opened',
        'flag_attempt_wrong',
        'flag_solved',
        'hint_unlocked',
        'lab_completed'
    )),
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 14. Performance Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON public.profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_rooms_slug ON public.rooms(slug);
CREATE INDEX IF NOT EXISTS idx_rooms_is_published ON public.rooms(is_published);
CREATE INDEX IF NOT EXISTS idx_rooms_display_order ON public.rooms(display_order);

CREATE INDEX IF NOT EXISTS idx_challenges_room_id ON public.challenges(room_id);
CREATE INDEX IF NOT EXISTS idx_challenges_is_published ON public.challenges(is_published);
CREATE INDEX IF NOT EXISTS idx_challenges_category ON public.challenges(category);

CREATE INDEX IF NOT EXISTS idx_submissions_challenge_id ON public.submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_team_id ON public.submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions(created_at);

CREATE INDEX IF NOT EXISTS idx_solves_user_id ON public.solves(user_id);
CREATE INDEX IF NOT EXISTS idx_solves_team_id ON public.solves(team_id);
CREATE INDEX IF NOT EXISTS idx_solves_challenge_id ON public.solves(challenge_id);
CREATE INDEX IF NOT EXISTS idx_solves_created_at ON public.solves(created_at);

CREATE INDEX IF NOT EXISTS idx_lab_progress_user_id ON public.lab_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_progress_room_id ON public.lab_progress(room_id);
CREATE INDEX IF NOT EXISTS idx_lab_progress_status ON public.lab_progress(status);
CREATE INDEX IF NOT EXISTS idx_lab_progress_last_activity ON public.lab_progress(last_activity_at);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON public.activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_team_id ON public.activity_events(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_room_id ON public.activity_events(room_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON public.activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON public.activity_events(created_at DESC);

-- ------------------------------------------------------------------------------
-- 15. Triggers & Functions
-- ------------------------------------------------------------------------------

-- Trigger function: Automatically create public.profiles row on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    clean_username TEXT;
    clean_display TEXT;
BEGIN
    -- Extract username from raw_user_meta_data or generate fallback from email
    clean_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        SPLIT_PART(NEW.email, '@', 1) || '_' || SUBSTRING(NEW.id::text, 1, 4)
    );
    -- Sanitize username characters
    clean_username := REGEXP_REPLACE(clean_username, '[^a-zA-Z0-9_-]', '_', 'g');
    IF char_length(clean_username) < 3 THEN
        clean_username := clean_username || '_ctf';
    END IF;
    clean_username := SUBSTRING(clean_username, 1, 20);

    clean_display := COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'username',
        SPLIT_PART(NEW.email, '@', 1)
    );
    clean_display := SUBSTRING(clean_display, 1, 50);

    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        role,
        last_seen_at,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        clean_username,
        clean_display,
        'user',
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger function: Update timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach update triggers
DROP TRIGGER IF EXISTS update_profiles_modtime ON public.profiles;
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_modtime ON public.teams;
CREATE TRIGGER update_teams_modtime
    BEFORE UPDATE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_rooms_modtime ON public.rooms;
CREATE TRIGGER update_rooms_modtime
    BEFORE UPDATE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_challenges_modtime ON public.challenges;
CREATE TRIGGER update_challenges_modtime
    BEFORE UPDATE ON public.challenges
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
