-- Rename legacy default competition titles while preserving custom event names.
UPDATE public.ctf_settings
SET title = 'CTF Championship',
    updated_at = NOW()
WHERE id = 1
  AND title IN ('CTF Arena', 'CTF Arena Championship', 'CTF Arena Cyber Championship');
