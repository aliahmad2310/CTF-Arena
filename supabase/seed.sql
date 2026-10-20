-- ==============================================================================
-- CTF Arena - Database Seed Data
-- File: supabase/seed.sql
-- Description: Initial test data including settings, labs, challenges, hints,
--              demo users, teams, solves, and activity events for monitoring validation.
-- Note: Strictly zero emoji anywhere in this file. Demo flags and hashes use pepper: arena_demo_pepper
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Initialize CTF Settings
-- ------------------------------------------------------------------------------
INSERT INTO public.ctf_settings (
    id,
    title,
    start_time,
    end_time,
    is_active,
    freeze_leaderboard,
    dynamic_scoring,
    max_team_size,
    leaderboard_refresh_seconds
) VALUES (
    1,
    'CTF Arena Cyber Championship',
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '5 days',
    TRUE,
    FALSE,
    FALSE,
    4,
    15
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    is_active = EXCLUDED.is_active,
    leaderboard_refresh_seconds = EXCLUDED.leaderboard_refresh_seconds;

-- ------------------------------------------------------------------------------
-- 2. Seed Demo Teams
-- ------------------------------------------------------------------------------
INSERT INTO public.teams (id, name, invite_code, created_at) VALUES
    ('00000000-0000-0000-0000-000000000001', 'NullPointers', 'INV-NULLP01', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0000-000000000002', 'BinaryBandits', 'INV-BANDIT2', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0000-000000000003', 'CyberSentinels', 'INV-SENTIN3', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Seed Demo Users in auth.users & profiles
-- Note: inserting synthetic records in auth.users ensures profile triggers fire cleanly
-- ------------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
    ('10000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'admin@ctfarena.local', '$2a$10$demoencryptedpasswordplaceholderhash00000000000000000', NOW(), '{"provider":"email","providers":["email"]}', '{"username":"admin","display_name":"System Administrator"}', NOW() - INTERVAL '3 days', NOW()),
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'alice@ctfarena.local', '$2a$10$demoencryptedpasswordplaceholderhash00000000000000000', NOW(), '{"provider":"email","providers":["email"]}', '{"username":"alice_sec","display_name":"Alice Security"}', NOW() - INTERVAL '2 days', NOW()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'bob@ctfarena.local', '$2a$10$demoencryptedpasswordplaceholderhash00000000000000000', NOW(), '{"provider":"email","providers":["email"]}', '{"username":"bob_pwn","display_name":"Bob The Exploit"}', NOW() - INTERVAL '2 days', NOW()),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'charlie@ctfarena.local', '$2a$10$demoencryptedpasswordplaceholderhash00000000000000000', NOW(), '{"provider":"email","providers":["email"]}', '{"username":"charlie_crypto","display_name":"Charlie Keys"}', NOW() - INTERVAL '2 days', NOW()),
    ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'david@ctfarena.local', '$2a$10$demoencryptedpasswordplaceholderhash00000000000000000', NOW(), '{"provider":"email","providers":["email"]}', '{"username":"david_novice","display_name":"David Novice"}', NOW() - INTERVAL '1 day', NOW()),
    ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'inactive_user@ctfarena.local', '$2a$10$demoencryptedpasswordplaceholderhash00000000000000000', NOW(), '{"provider":"email","providers":["email"]}', '{"username":"sleeper_agent","display_name":"Sleeper Agent"}', NOW() - INTERVAL '1 day', NOW())
ON CONFLICT (id) DO NOTHING;

-- Populate or update public.profiles with team associations and role configurations
INSERT INTO public.profiles (id, username, display_name, role, team_id, last_seen_at) VALUES
    ('10000000-0000-0000-0000-000000000000', 'admin', 'System Administrator', 'admin', NULL, NOW()),
    ('10000000-0000-0000-0000-000000000001', 'alice_sec', 'Alice Security', 'user', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 minutes'),
    ('10000000-0000-0000-0000-000000000002', 'bob_pwn', 'Bob The Exploit', 'user', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 minutes'),
    ('10000000-0000-0000-0000-000000000003', 'charlie_crypto', 'Charlie Keys', 'user', '00000000-0000-0000-0000-000000000002', NOW() - INTERVAL '15 minutes'),
    ('10000000-0000-0000-0000-000000000004', 'david_novice', 'David Novice', 'user', '00000000-0000-0000-0000-000000000003', NOW() - INTERVAL '25 minutes'),
    ('10000000-0000-0000-0000-000000000005', 'sleeper_agent', 'Sleeper Agent', 'user', NULL, NOW() - INTERVAL '24 hours')
ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    team_id = EXCLUDED.team_id,
    last_seen_at = EXCLUDED.last_seen_at;

-- Set team captains
UPDATE public.teams SET captain_id = '10000000-0000-0000-0000-000000000001' WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE public.teams SET captain_id = '10000000-0000-0000-0000-000000000003' WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE public.teams SET captain_id = '10000000-0000-0000-0000-000000000004' WHERE id = '00000000-0000-0000-0000-000000000003';

-- ------------------------------------------------------------------------------
-- 4. Seed Demo Rooms (Labs)
-- ------------------------------------------------------------------------------
INSERT INTO public.rooms (id, title, slug, description, difficulty, tags, is_published, display_order) VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        'Web Application Security',
        'web-app-security',
        'Analyze common web application flaws including SQL Injection, Cross-Site Scripting (XSS), and Command Injection vectors against vulnerable endpoints.',
        'Easy',
        ARRAY['web', 'owasp', 'sqli', 'xss', 'rce'],
        TRUE,
        1
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        'Network & Binary Exploitation',
        'network-binary-exploitation',
        'Deep dive into packet forensics, classic cryptanalysis, and basic Linux binary memory corruption primitives.',
        'Medium',
        ARRAY['network', 'forensics', 'crypto', 'pwn', 'wireshark'],
        TRUE,
        2
    )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Seed Demo Challenges
-- ------------------------------------------------------------------------------
INSERT INTO public.challenges (id, room_id, title, description, category, points, difficulty, external_link, is_published, display_order) VALUES
    (
        '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'SQL Injection Fundamentals',
        'The administrative login portal at `/api/v1/auth/admin` is susceptible to boolean-based SQL injection. Bypass authentication to retrieve the administrative flag.',
        'Web',
        100,
        'Easy',
        'http://target1.local:8080/login',
        TRUE,
        1
    ),
    (
        '30000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001',
        'Cross-Site Scripting Discovery',
        'Find the persistent XSS flaw in the feedback submission box. The simulated bot administrator regularly reviews all entries with cookies enabled.',
        'Web',
        150,
        'Easy',
        'http://target1.local:8080/feedback',
        TRUE,
        2
    ),
    (
        '30000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000001',
        'Command Injection Bypass',
        'The network ping utility allows diagnosing connectivity, but input sanitization is flawed. Execute arbitrary commands to locate the flag file.',
        'Web',
        200,
        'Medium',
        'http://target1.local:8080/tools/ping',
        TRUE,
        3
    ),
    (
        '30000000-0000-0000-0000-000000000004',
        '20000000-0000-0000-0000-000000000002',
        'Caesar & Modern Cryptography',
        'A transmitted message was encrypted using a combination of Caesar rotation and a XOR keystream. Decrypt the ciphertext.',
        'Crypto',
        100,
        'Easy',
        NULL,
        TRUE,
        1
    ),
    (
        '30000000-0000-0000-0000-000000000005',
        '20000000-0000-0000-0000-000000000002',
        'PCAP Packet Sleuth',
        'Analyze the provided packet capture file to identify suspicious exfiltration traffic conducted over ICMP tunnels.',
        'Forensics',
        150,
        'Medium',
        NULL,
        TRUE,
        2
    ),
    (
        '30000000-0000-0000-0000-000000000006',
        '20000000-0000-0000-0000-000000000002',
        'Buffer Overflow Primer',
        'A vulnerable 32-bit x86 ELF binary is running on port 9001. Overflow the local buffer to redirect execution into the hidden `win()` routine.',
        'Pwn',
        250,
        'Hard',
        'nc target2.local 9001',
        TRUE,
        3
    )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. Seed Demo Flags (Hashed using SHA-256 with salt and pepper arena_demo_pepper)
-- Plaintext values provided for testing purposes:
-- 1: CTF{demo_sqli_auth_bypass_1234}
-- 2: CTF{demo_stored_xss_cookie_leak}
-- 3: CTF{demo_cmd_injection_rce_ok}
-- 4: CTF{demo_caesar_cipher_shift_secret}
-- 5: CTF{demo_pcap_wireshark_extracted}
-- 6: CTF{demo_stack_smash_eip_override}
-- ------------------------------------------------------------------------------
INSERT INTO public.challenge_flags (challenge_id, flag_hash, salt, is_case_sensitive) VALUES
    ('30000000-0000-0000-0000-000000000001', '8ea231883673c4222b069c39471f36d867609665e78b56d5178a2edd9f3d5d73', 'demo_salt_web_1', TRUE),
    ('30000000-0000-0000-0000-000000000002', 'a3da509c588b507435d9bb96e72e56e364319f999f935508650c00e0cb81b289', 'demo_salt_web_2', TRUE),
    ('30000000-0000-0000-0000-000000000003', 'ba9dd8ded4c7a3e470f5ce7dc7c1837438837846ac39520d202fc512dad68e82', 'demo_salt_web_3', TRUE),
    ('30000000-0000-0000-0000-000000000004', 'e0a26f1dcad233389ec6754e7246d99549c7cd2b9d1dea82abcb9a6bc88fb4fc', 'demo_salt_net_1', TRUE),
    ('30000000-0000-0000-0000-000000000005', '01fd5436422f3d825abd3b9d8f74c25ce4e6eacd36049b9978bb8438a371795c', 'demo_salt_net_2', TRUE),
    ('30000000-0000-0000-0000-000000000006', '1dc10f102e5b3206993d41a01db0e81c1e35b4e9db22f27b72e5be8045f57c33', 'demo_salt_net_3', TRUE)
ON CONFLICT (challenge_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. Seed Demo Hints
-- ------------------------------------------------------------------------------
INSERT INTO public.hints (id, challenge_id, content, cost, display_order) VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Try testing username strings with classic quotes like admin'' OR 1=1 --', 25, 1),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Examine shell separators such as ; or && or pipe operators.', 50, 1),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000006', 'Check the offset between the start of the buffer and the saved EIP pointer using a cyclic pattern.', 50, 1)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. Seed Solves & Hint Unlocks (Demonstrates complete, in-progress, and not started)
-- Alice has completed Room 1 (all 3 challenges) and 1 challenge in Room 2
-- Bob has solved 1 challenge in Room 1
-- Charlie has unlocked a hint and solved 1 challenge in Room 2
-- David has attempted Room 1 with wrong submissions (stuck)
-- Sleeper Agent has 0 solves (not started)
-- ------------------------------------------------------------------------------
INSERT INTO public.solves (id, challenge_id, user_id, team_id, points_awarded, is_first_blood, created_at) VALUES
    -- Alice solves Room 1: 3/3 (Completed)
    ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 100, TRUE, NOW() - INTERVAL '1 day'),
    ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 150, TRUE, NOW() - INTERVAL '22 hours'),
    ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 200, TRUE, NOW() - INTERVAL '20 hours'),
    -- Alice solves Room 2: 1/3
    ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 100, TRUE, NOW() - INTERVAL '15 hours'),

    -- Bob solves Room 1: 1/3 (In Progress)
    ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 100, FALSE, NOW() - INTERVAL '18 hours'),

    -- Charlie solves Room 2: 1/3 (In Progress)
    ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 100, FALSE, NOW() - INTERVAL '10 hours')
ON CONFLICT (id) DO NOTHING;

-- Charlie unlocked a hint for Challenge 1
INSERT INTO public.hint_unlocks (id, hint_id, user_id, team_id, cost, created_at) VALUES
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 25, NOW() - INTERVAL '12 hours')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. Seed Lab Progress Statuses
-- ------------------------------------------------------------------------------
-- Alice: Room 1 Completed (3/3), Room 2 In Progress (1/3)
INSERT INTO public.lab_progress (user_id, room_id, status, started_at, last_activity_at, completed_at, solved_count, total_count, points_earned) VALUES
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'completed', NOW() - INTERVAL '25 hours', NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours', 3, 3, 450),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'in_progress', NOW() - INTERVAL '16 hours', NOW() - INTERVAL '2 minutes', NULL, 1, 3, 100),

-- Bob: Room 1 In Progress (1/3)
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'in_progress', NOW() - INTERVAL '19 hours', NOW() - INTERVAL '3 minutes', NULL, 1, 3, 100),

-- Charlie: Room 2 In Progress (1/3)
    ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'in_progress', NOW() - INTERVAL '14 hours', NOW() - INTERVAL '15 minutes', NULL, 1, 3, 75),

-- David: Room 1 In Progress (0 solves, but attempted)
    ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'in_progress', NOW() - INTERVAL '35 minutes', NOW() - INTERVAL '25 minutes', NULL, 0, 3, 0)
ON CONFLICT (user_id, room_id) DO NOTHING;

-- Update current room/challenge on profiles for active competitors
UPDATE public.profiles 
SET current_room_id = '20000000-0000-0000-0000-000000000002', current_challenge_id = '30000000-0000-0000-0000-000000000005'
WHERE id = '10000000-0000-0000-0000-000000000001';

UPDATE public.profiles 
SET current_room_id = '20000000-0000-0000-0000-000000000001', current_challenge_id = '30000000-0000-0000-0000-000000000002'
WHERE id = '10000000-0000-0000-0000-000000000002';

UPDATE public.profiles 
SET current_room_id = '20000000-0000-0000-0000-000000000001', current_challenge_id = '30000000-0000-0000-0000-000000000001'
WHERE id = '10000000-0000-0000-0000-000000000004';

-- ------------------------------------------------------------------------------
-- 10. Seed Activity Events & Flag Submissions
-- ------------------------------------------------------------------------------
INSERT INTO public.submissions (challenge_id, user_id, team_id, submitted_flag, is_correct, created_at) VALUES
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'CTF{demo_sqli_auth_bypass_1234}', TRUE, NOW() - INTERVAL '1 day'),
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'CTF{random_guess_1}', FALSE, NOW() - INTERVAL '30 minutes'),
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'CTF{random_guess_2}', FALSE, NOW() - INTERVAL '27 minutes'),
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'CTF{admin_password}', FALSE, NOW() - INTERVAL '25 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_events (user_id, team_id, event_type, room_id, challenge_id, metadata, created_at) VALUES
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'flag_solved', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '{"points": 200, "first_blood": true}'::jsonb, NOW() - INTERVAL '20 hours'),
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'lab_completed', '20000000-0000-0000-0000-000000000001', NULL, '{"total_points": 450}'::jsonb, NOW() - INTERVAL '20 hours'),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'hint_unlocked', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '{"cost": 25}'::jsonb, NOW() - INTERVAL '12 hours'),
    ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'flag_attempt_wrong', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '{"attempt_count": 3}'::jsonb, NOW() - INTERVAL '25 minutes'),
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'challenge_opened', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', '{}'::jsonb, NOW() - INTERVAL '2 minutes')
ON CONFLICT (id) DO NOTHING;
