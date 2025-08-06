-- ============================================================================
-- Discord OAuth Avatar URL Tests
-- ============================================================================
-- This test suite validates Discord OAuth avatar URL extraction including:
-- - Avatar URL extraction from both 'avatar_url' and 'picture' fields
-- - Two-phase Discord authentication flow handling
-- - UPDATE operation trigger functionality for avatar URLs
-- - Provider error handling when null
-- ============================================================================
BEGIN;

-- Plan the number of tests
SELECT plan(8);

-- Clean up any existing test data
DELETE FROM auth.users WHERE email LIKE '%discord-test%';

-- ============================================================================
-- Test 1: Avatar URL extraction prioritizes avatar_url over picture
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    profile_avatar text;
BEGIN
    -- Create user with both avatar_url and picture fields
    INSERT INTO auth.users (
        id, email, encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES (
        test_user_id,
        'discord-test-1@example.com',
        crypt('password', gen_salt('bf')),
        NOW(), NOW(),
        '{"provider": "discord", "providers": ["discord"]}'::jsonb,
        '{"full_name": "Test User", "avatar_url": "https://example.com/avatar1.png", "picture": "https://example.com/picture1.png"}'::jsonb
    );
    
    -- Check profile was created with correct avatar_url
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    -- avatar_url should take precedence over picture
    PERFORM is(profile_avatar, 'https://example.com/avatar1.png', 'Avatar URL should prioritize avatar_url field over picture');
END;
$$;

-- ============================================================================
-- Test 2: Avatar URL extraction falls back to picture when avatar_url is null
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    profile_avatar text;
BEGIN
    -- Create user with only picture field (avatar_url is null)
    INSERT INTO auth.users (
        id, email, encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES (
        test_user_id,
        'discord-test-2@example.com',
        crypt('password', gen_salt('bf')),
        NOW(), NOW(),
        '{"provider": "discord", "providers": ["discord"]}'::jsonb,
        '{"full_name": "Test User", "picture": "https://example.com/picture2.png"}'::jsonb
    );
    
    -- Check profile was created with picture as avatar_url
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    -- Should fallback to picture field
    PERFORM is(profile_avatar, 'https://example.com/picture2.png', 'Avatar URL should fallback to picture field when avatar_url is null');
END;
$$;

-- ============================================================================
-- Test 3: Discord OAuth two-phase authentication flow - Phase 1 (no avatar)
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    profile_avatar text;
BEGIN
    -- Phase 1: Create user without avatar (typical initial Discord OAuth step)
    INSERT INTO auth.users (
        id, email, encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES (
        test_user_id,
        'discord-test-3@example.com',
        crypt('password', gen_salt('bf')),
        NOW(), NOW(),
        '{"provider": "discord", "providers": ["discord"]}'::jsonb,
        '{"full_name": "sixtycakes", "email": "discord-test-3@example.com"}'::jsonb -- No avatar fields
    );
    
    -- Check profile was created without avatar
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    PERFORM is(profile_avatar, NULL, 'Phase 1: Profile should be created without avatar URL');
END;
$$;

-- ============================================================================
-- Test 4: Discord OAuth two-phase authentication flow - Phase 2 (UPDATE with avatar)
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid;
    profile_avatar text;
BEGIN
    -- Get the user ID from the previous test
    SELECT id INTO test_user_id FROM auth.users WHERE email = 'discord-test-3@example.com';
    
    -- Phase 2: Update user with complete Discord metadata including avatar
    UPDATE auth.users 
    SET raw_user_meta_data = '{
        "iss": "https://discord.com/api", 
        "sub": "111684119557062656", 
        "name": "sixtycakes#0", 
        "email": "discord-test-3@example.com", 
        "picture": "https://cdn.discordapp.com/avatars/111684119557062656/7da147a9cfd986ebfc59edbd99f5538d.png", 
        "full_name": "sixtycakes", 
        "avatar_url": "https://cdn.discordapp.com/avatars/111684119557062656/7da147a9cfd986ebfc59edbd99f5538d.png", 
        "provider_id": "111684119557062656", 
        "custom_claims": {"global_name": "sixtycakes"}, 
        "email_verified": true, 
        "phone_verified": false
    }'::jsonb
    WHERE id = test_user_id;
    
    -- Check profile was updated with avatar URL
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    PERFORM is(profile_avatar, 'https://cdn.discordapp.com/avatars/111684119557062656/7da147a9cfd986ebfc59edbd99f5538d.png', 'Phase 2: Profile should be updated with Discord avatar URL');
END;
$$;

-- ============================================================================
-- Test 5: UPDATE operation only with picture field (no avatar_url)
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    profile_avatar text;
BEGIN
    -- Create user without avatar initially
    INSERT INTO auth.users (
        id, email, encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES (
        test_user_id,
        'discord-test-5@example.com',
        crypt('password', gen_salt('bf')),
        NOW(), NOW(),
        '{"provider": "discord", "providers": ["discord"]}'::jsonb,
        '{"full_name": "Test User"}'::jsonb
    );
    
    -- Update with only picture field (Discord sometimes only provides picture)
    UPDATE auth.users 
    SET raw_user_meta_data = '{"full_name": "Test User", "picture": "https://example.com/fallback-picture.png"}'::jsonb
    WHERE id = test_user_id;
    
    -- Check profile was updated with picture as avatar
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    PERFORM is(profile_avatar, 'https://example.com/fallback-picture.png', 'UPDATE should extract avatar from picture field when avatar_url is not available');
END;
$$;

-- ============================================================================
-- Test 6: Providers field error handling when null
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    error_caught boolean := false;
BEGIN
    -- Try to create user with null providers (should fail)
    BEGIN
        INSERT INTO auth.users (
            id, email, encrypted_password, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data
        ) VALUES (
            test_user_id,
            'discord-test-6@example.com',
            crypt('password', gen_salt('bf')),
            NOW(), NOW(),
            '{}'::jsonb, -- No providers field
            '{"full_name": "Test User"}'::jsonb
        );
    EXCEPTION
        WHEN OTHERS THEN
            error_caught := true;
    END;
    
    PERFORM ok(error_caught, 'Should raise exception when providers field is null');
END;
$$;

-- ============================================================================
-- Test 7: Real Discord metadata extraction (exact format from user report)
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    profile_avatar text;
BEGIN
    -- Create user with exact Discord metadata format provided by user
    INSERT INTO auth.users (
        id, email, encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES (
        test_user_id,
        'jasoncluck@gmail.com',
        crypt('password', gen_salt('bf')),
        NOW(), NOW(),
        '{"provider": "discord", "providers": ["discord"]}'::jsonb,
        '{
            "iss": "https://discord.com/api", 
            "sub": "111684119557062656", 
            "name": "sixtycakes#0", 
            "email": "jasoncluck@gmail.com", 
            "picture": "https://cdn.discordapp.com/avatars/111684119557062656/7da147a9cfd986ebfc59edbd99f5538d.png", 
            "full_name": "sixtycakes", 
            "avatar_url": "https://cdn.discordapp.com/avatars/111684119557062656/7da147a9cfd986ebfc59edbd99f5538d.png", 
            "provider_id": "111684119557062656", 
            "custom_claims": {"global_name": "sixtycakes"}, 
            "email_verified": true, 
            "phone_verified": false
        }'::jsonb
    );
    
    -- Check profile extracted the Discord avatar correctly
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    PERFORM is(profile_avatar, 'https://cdn.discordapp.com/avatars/111684119557062656/7da147a9cfd986ebfc59edbd99f5538d.png', 'Should extract Discord avatar from real user metadata');
END;
$$;

-- ============================================================================
-- Test 8: Verify no avatar fields results in NULL
-- ============================================================================
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    profile_avatar text;
BEGIN
    -- Create user without any avatar fields
    INSERT INTO auth.users (
        id, email, encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES (
        test_user_id,
        'discord-test-8@example.com',
        crypt('password', gen_salt('bf')),
        NOW(), NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        '{"full_name": "Test User", "email": "discord-test-8@example.com"}'::jsonb -- No avatar fields
    );
    
    -- Check profile has NULL avatar (expected behavior)
    SELECT avatar_url INTO profile_avatar FROM public.profiles WHERE id = test_user_id;
    
    PERFORM is(profile_avatar, NULL, 'Profile should have NULL avatar when no avatar fields are present');
END;
$$;

-- Finish the test suite
SELECT * FROM finish();

ROLLBACK;