-- Preserve each competitor's solve while removing duplicate team-level awards
-- created before this uniqueness guard was installed.
WITH ranked_team_solves AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY challenge_id, team_id
            ORDER BY created_at, id
        ) AS team_solve_number
    FROM public.solves
    WHERE team_id IS NOT NULL
)
UPDATE public.solves AS solves
SET team_id = NULL
FROM ranked_team_solves AS ranked
WHERE solves.id = ranked.id
  AND ranked.team_solve_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_solve_team_challenge
    ON public.solves (challenge_id, team_id)
    WHERE team_id IS NOT NULL;