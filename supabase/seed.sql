-- ==============================================================================
-- CTF Arena - Database Seed Data (Clean Production Seed)
-- File: supabase/seed.sql
-- Description: Clean initial configuration: CTF settings, base labs, challenges,
--              flags, and hints. Strictly NO dummy accounts, fake users, or test solves.
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
    'CTF Championship',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '7 days',
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
-- 2. Base Labs (Rooms)
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
-- 3. Base Challenges
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
        'Network Packet Forensics',
        'Inspect captured PCAP traffic to identify exfiltrated administrative credentials and reassemble transmitted payloads.',
        'Forensics',
        175,
        'Medium',
        NULL,
        TRUE,
        2
    ),
    (
        '30000000-0000-0000-0000-000000000006',
        '20000000-0000-0000-0000-000000000002',
        'Buffer Overflow Intro',
        'Exploit a classic x86 stack buffer overflow with disabled memory protections to redirect execution flow to the win() function.',
        'Pwn',
        250,
        'Hard',
        NULL,
        TRUE,
        3
    )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Challenge Flags (SHA-256 with salt and pepper)
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
-- 5. Challenge Hints
-- ------------------------------------------------------------------------------
INSERT INTO public.hints (id, challenge_id, content, cost, display_order) VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Try testing username strings with classic quotes like admin'' OR 1=1 --', 25, 1),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Examine shell separators such as ; or && or pipe operators.', 50, 1),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000006', 'Check the offset between the start of the buffer and the saved EIP pointer using a cyclic pattern.', 50, 1)
ON CONFLICT (id) DO NOTHING;
