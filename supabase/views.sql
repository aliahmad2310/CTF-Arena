-- ==============================================================================
-- CTF Arena - Database Views & Functions
-- File: supabase/views.sql
-- Description: Analytical views for leaderboards, score timelines, and admin monitoring.
-- Note: Strictly zero emoji anywhere in this file.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. User Leaderboard View
-- Calculates net score = SUM(solve points) - SUM(unlocked hint penalties)
-- Tie-break rule: earliest timestamp of the solve that reached the final score
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.user_leaderboard AS
WITH user_solves AS (
    SELECT
        s.user_id,
        COALESCE(SUM(s.points_awarded), 0)::INT AS gross_points,
        COUNT(s.id)::INT AS solves_count,
        MAX(s.created_at) AS last_solve_at
    FROM public.solves s
    JOIN public.profiles p ON p.id = s.user_id AND p.role = 'user'
    GROUP BY s.user_id
),
user_hints AS (
    SELECT
        hu.user_id,
        COALESCE(SUM(hu.cost), 0)::INT AS hint_deductions
    FROM public.hint_unlocks hu
    JOIN public.profiles p ON p.id = hu.user_id AND p.role = 'user'
    GROUP BY hu.user_id
),
scored_users AS (
    SELECT
        p.id AS user_id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.team_id,
        t.name AS team_name,
        p.is_banned,
        GREATEST(0, COALESCE(us.gross_points, 0) - COALESCE(uh.hint_deductions, 0))::INT AS score,
        COALESCE(us.solves_count, 0)::INT AS solves_count,
        us.last_solve_at
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.team_id
    LEFT JOIN user_solves us ON us.user_id = p.id
    LEFT JOIN user_hints uh ON uh.user_id = p.id
    WHERE p.role = 'user' AND p.is_banned = FALSE
)
SELECT
    DENSE_RANK() OVER (
        ORDER BY score DESC, last_solve_at ASC NULLS LAST, username ASC
    )::INT AS rank,
    user_id,
    username,
    display_name,
    avatar_url,
    team_id,
    team_name,
    score,
    solves_count,
    last_solve_at
FROM scored_users;

-- ------------------------------------------------------------------------------
-- 2. Team Leaderboard View
-- Calculates unique team solves and team hint deductions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.team_leaderboard AS
WITH team_solves AS (
    SELECT
        s.team_id,
        COALESCE(SUM(s.points_awarded), 0)::INT AS gross_points,
        COUNT(DISTINCT s.challenge_id)::INT AS solves_count,
        MAX(s.created_at) AS last_solve_at
    FROM public.solves s
    JOIN public.profiles p ON p.id = s.user_id AND p.role = 'user'
    WHERE s.team_id IS NOT NULL
    GROUP BY s.team_id
),
team_hints AS (
    SELECT
        hu.team_id,
        COALESCE(SUM(hu.cost), 0)::INT AS hint_deductions
    FROM public.hint_unlocks hu
    JOIN public.profiles p ON p.id = hu.user_id AND p.role = 'user'
    WHERE hu.team_id IS NOT NULL
    GROUP BY hu.team_id
),
scored_teams AS (
    SELECT
        t.id AS team_id,
        t.name AS team_name,
        GREATEST(0, COALESCE(ts.gross_points, 0) - COALESCE(th.hint_deductions, 0))::INT AS score,
        COALESCE(ts.solves_count, 0)::INT AS solves_count,
        ts.last_solve_at,
        COUNT(p.id)::INT AS member_count
    FROM public.teams t
    LEFT JOIN team_solves ts ON ts.team_id = t.id
    LEFT JOIN team_hints th ON th.team_id = t.id
    LEFT JOIN public.profiles p ON p.team_id = t.id AND p.is_banned = FALSE
    GROUP BY t.id, t.name, ts.gross_points, th.hint_deductions, ts.solves_count, ts.last_solve_at
)
SELECT
    DENSE_RANK() OVER (
        ORDER BY score DESC, last_solve_at ASC NULLS LAST, team_name ASC
    )::INT AS rank,
    team_id,
    team_name,
    score,
    solves_count,
    last_solve_at,
    member_count
FROM scored_teams;

-- ------------------------------------------------------------------------------
-- 3. Score Timeline View (Cumulative score progression for top charts)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.score_timeline AS
SELECT
    s.id AS solve_id,
    s.created_at AS timestamp,
    s.team_id,
    t.name AS team_name,
    s.user_id,
    p.username,
    s.points_awarded,
    SUM(s.points_awarded) OVER (
        PARTITION BY COALESCE(s.team_id, s.user_id)
        ORDER BY s.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::INT AS cumulative_score
FROM public.solves s
LEFT JOIN public.teams t ON t.id = s.team_id
LEFT JOIN public.profiles p ON p.id = s.user_id
WHERE p.role = 'user'
ORDER BY s.created_at ASC;

-- ------------------------------------------------------------------------------
-- 4. Admin Monitoring: User Summary View
-- Powers admin/progress.html directory with fast single-query metrics
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_user_summary AS
WITH total_published_labs AS (
    SELECT COUNT(*)::INT AS count FROM public.rooms WHERE is_published = TRUE
),
user_progress_agg AS (
    SELECT
        lp.user_id,
        COUNT(CASE WHEN lp.status = 'completed' THEN 1 END)::INT AS labs_completed,
        COUNT(CASE WHEN lp.status = 'in_progress' THEN 1 END)::INT AS labs_in_progress,
        COALESCE(SUM(lp.points_earned), 0)::INT AS total_points
    FROM public.lab_progress lp
    JOIN public.rooms r ON r.id = lp.room_id AND r.is_published = TRUE
    GROUP BY lp.user_id
)
SELECT
    p.id AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.role,
    p.is_banned,
    p.team_id,
    t.name AS team_name,
    p.last_seen_at,
    (p.last_seen_at >= NOW() - INTERVAL '5 minutes') AS is_online,
    p.current_room_id,
    rm.title AS current_room_title,
    p.current_challenge_id,
    ch.title AS current_challenge_title,
    COALESCE(upa.labs_completed, 0)::INT AS labs_completed,
    COALESCE(upa.labs_in_progress, 0)::INT AS labs_in_progress,
    GREATEST(0, (SELECT count FROM total_published_labs) - (COALESCE(upa.labs_completed, 0) + COALESCE(upa.labs_in_progress, 0)))::INT AS labs_not_started,
    (SELECT count FROM total_published_labs)::INT AS total_labs,
    CASE 
        WHEN (SELECT count FROM total_published_labs) > 0 
        THEN ROUND((COALESCE(upa.labs_completed, 0)::NUMERIC / (SELECT count FROM total_published_labs)::NUMERIC) * 100, 1)
        ELSE 0.0
    END AS completion_percent,
    COALESCE(upa.total_points, 0)::INT AS total_points,
    p.created_at AS registered_at
FROM public.profiles p
LEFT JOIN public.teams t ON t.id = p.team_id
LEFT JOIN user_progress_agg upa ON upa.user_id = p.id
LEFT JOIN public.rooms rm ON rm.id = p.current_room_id
LEFT JOIN public.challenges ch ON ch.id = p.current_challenge_id;

-- ------------------------------------------------------------------------------
-- 5. Admin Monitoring: Lab Statistics View
-- Aggregates completions, drop-offs, and solve averages for each lab
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_lab_stats AS
WITH room_challenge_counts AS (
    SELECT
        c.room_id,
        COUNT(*)::INT AS challenge_count,
        COALESCE(SUM(c.points), 0)::INT AS total_points
    FROM public.challenges c
    WHERE c.is_published = TRUE
    GROUP BY c.room_id
),
room_progress_agg AS (
    SELECT
        lp.room_id,
        COUNT(DISTINCT lp.user_id)::INT AS total_users_engaged,
        COUNT(CASE WHEN lp.status = 'completed' THEN 1 END)::INT AS completed_count,
        COUNT(CASE WHEN lp.status = 'in_progress' THEN 1 END)::INT AS in_progress_count,
        AVG(CASE 
            WHEN lp.status = 'completed' AND lp.started_at IS NOT NULL AND lp.completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (lp.completed_at - lp.started_at))
            ELSE NULL 
        END)::INT AS avg_completion_time_seconds
    FROM public.lab_progress lp
    GROUP BY lp.room_id
)
SELECT
    r.id AS room_id,
    r.title,
    r.slug,
    r.difficulty,
    r.display_order,
    r.is_published,
    COALESCE(rcc.challenge_count, 0)::INT AS total_challenges,
    COALESCE(rcc.total_points, 0)::INT AS total_points,
    COALESCE(rpa.total_users_engaged, 0)::INT AS total_users_engaged,
    COALESCE(rpa.completed_count, 0)::INT AS completed_count,
    COALESCE(rpa.in_progress_count, 0)::INT AS in_progress_count,
    COALESCE(rpa.avg_completion_time_seconds, 0)::INT AS avg_completion_time_seconds,
    CASE 
        WHEN COALESCE(rpa.total_users_engaged, 0) > 0 
        THEN ROUND((COALESCE(rpa.completed_count, 0)::NUMERIC / rpa.total_users_engaged::NUMERIC) * 100, 1)
        ELSE 0.0
    END AS completion_rate_percent
FROM public.rooms r
LEFT JOIN room_challenge_counts rcc ON rcc.room_id = r.id
LEFT JOIN room_progress_agg rpa ON rpa.room_id = r.id;

-- ------------------------------------------------------------------------------
-- 6. Admin Monitoring: Live Activity Feed View
-- Returns high-resolution event logs with user, team, room, and challenge names
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_live_activity AS
SELECT
    ae.id AS event_id,
    ae.event_type,
    ae.created_at,
    ae.user_id,
    p.username,
    p.display_name,
    ae.team_id,
    t.name AS team_name,
    ae.room_id,
    r.title AS room_title,
    r.slug AS room_slug,
    ae.challenge_id,
    c.title AS challenge_title,
    c.category AS challenge_category,
    ae.metadata
FROM public.activity_events ae
JOIN public.profiles p ON p.id = ae.user_id
LEFT JOIN public.teams t ON t.id = ae.team_id
LEFT JOIN public.rooms r ON r.id = ae.room_id
LEFT JOIN public.challenges c ON c.id = ae.challenge_id
ORDER BY ae.created_at DESC;

-- ------------------------------------------------------------------------------
-- 7. Admin Monitoring: User by Lab Progress Status Matrix View
-- Cross-tabulation view of user and lab progress
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_user_lab_status AS
SELECT
    p.id AS user_id,
    p.username,
    p.display_name,
    p.team_id,
    t.name AS team_name,
    r.id AS room_id,
    r.title AS room_title,
    r.slug AS room_slug,
    r.display_order AS room_order,
    COALESCE(lp.status, 'not_started') AS status,
    COALESCE(lp.solved_count, 0)::INT AS solved_count,
    COALESCE(lp.total_count, (
        SELECT COUNT(*)::INT FROM public.challenges c WHERE c.room_id = r.id AND c.is_published = TRUE
    ))::INT AS total_count,
    COALESCE(lp.points_earned, 0)::INT AS points_earned,
    lp.started_at,
    lp.last_activity_at,
    lp.completed_at
FROM public.profiles p
CROSS JOIN public.rooms r
LEFT JOIN public.teams t ON t.id = p.team_id
LEFT JOIN public.lab_progress lp ON lp.user_id = p.id AND lp.room_id = r.id
WHERE p.role = 'user' AND r.is_published = TRUE;
