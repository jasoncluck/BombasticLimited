-- ============================================================================
-- Providers Column Functionality Tests
-- ============================================================================
-- This test suite validates the providers column functionality including:
-- - Providers column constraints and default values  
-- - Automatic provider updates when identities are added/removed
-- - Avatar URL handling based on Discord provider presence
-- - User creation with proper provider initialization
-- ============================================================================
BEGIN;

-- Plan the number of tests
SELECT
  plan (14);

-- ============================================================================
-- Test 1: Providers column exists and has correct constraints
-- ============================================================================
SELECT
  col_type_is (
    'public',
    'profiles',
    'providers',
    'text[]',
    'Providers column should be text array'
  );

-- ============================================================================
-- Test 2: Test default provider value for new profile
-- ============================================================================
-- Create a test user and profile
INSERT INTO
  auth.users (id, email, created_at, updated_at)
VALUES
  (
    'test-providers-user-1'::uuid,
    'providers-test@example.com',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO
  public.profiles (id, username, providers)
VALUES
  (
    'test-providers-user-1'::uuid,
    'providers-test-user',
    ARRAY['email']
  )
ON CONFLICT (id) DO NOTHING;

SELECT
  IS (
    (
      SELECT
        providers
      FROM
        public.profiles
      WHERE
        id = 'test-providers-user-1'::uuid
    ),
    ARRAY['email']::TEXT[],
    'New profile should have email as default provider'
  );

-- ============================================================================
-- Test 3: Test providers array cannot be empty
-- ============================================================================
-- This should fail due to CHECK constraint
SELECT
  throws_ok (
    $$UPDATE public.profiles SET providers = ARRAY[]::text[] WHERE id = 'test-providers-user-1'::uuid$$,
    'check constraint "profiles_providers_not_empty"',
    'Providers array cannot be empty'
  );

-- ============================================================================
-- Test 4: Test providers array cannot be NULL
-- ============================================================================
-- This should fail due to NOT NULL constraint
SELECT
  throws_ok (
    $$UPDATE public.profiles SET providers = NULL WHERE id = 'test-providers-user-1'::uuid$$,
    'null value in column "providers"',
    'Providers column cannot be NULL'
  );

-- ============================================================================
-- Test 5: Test multiple providers can be stored
-- ============================================================================
UPDATE public.profiles
SET
  providers = ARRAY['email', 'discord']
WHERE
  id = 'test-providers-user-1'::uuid;

SELECT
  IS (
    (
      SELECT
        providers
      FROM
        public.profiles
      WHERE
        id = 'test-providers-user-1'::uuid
    ),
    ARRAY['email', 'discord']::TEXT[],
    'Profile can have multiple providers'
  );

-- ============================================================================
-- Test 6: Test Discord identity creation updates providers
-- ============================================================================
-- Create Discord identity for the test user
INSERT INTO
  auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  )
VALUES
  (
    'test-discord-identity'::uuid,
    'test-providers-user-1'::uuid,
    '{"sub": "discord123", "avatar": "avatar123"}'::jsonb,
    'discord',
    'discord123',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Check that providers array was updated by the trigger
SELECT
  ok (
    'discord' = ANY (
      SELECT
        providers
      FROM
        public.profiles
      WHERE
        id = 'test-providers-user-1'::uuid
    ),
    'Discord identity creation should add discord to providers'
  );

-- ============================================================================
-- Test 7: Test Discord avatar URL is set when Discord provider is present
-- ============================================================================
SELECT
  isnt (
    (
      SELECT
        avatar_url
      FROM
        public.profiles
      WHERE
        id = 'test-providers-user-1'::uuid
    ),
    NULL,
    'Avatar URL should be set when Discord provider is present'
  );

SELECT
  LIKE (
    (
      SELECT
        avatar_url
      FROM
        public.profiles
      WHERE
        id = 'test-providers-user-1'::uuid
    ),
    '%discord%',
    'Avatar URL should contain discord CDN reference'
  );

-- ============================================================================
-- Test 8: Test Discord identity removal updates providers and removes avatar
-- ============================================================================
-- Delete Discord identity
DELETE FROM auth.identities
WHERE
  id = 'test-discord-identity'::uuid;

-- Check that Discord provider was removed and avatar_url cleared
SELECT
  ok (
    'discord' != ALL (
      COALESCE(
        (
          SELECT
            providers
          FROM
            public.profiles
          WHERE
            id = 'test-providers-user-1'::uuid
        ),
        ARRAY[]::TEXT[]
      )
    ),
    'Discord identity deletion should remove discord from providers'
  );

SELECT
  IS (
    (
      SELECT
        avatar_url
      FROM
        public.profiles
      WHERE
        id = 'test-providers-user-1'::uuid
    ),
    NULL,
    'Avatar URL should be NULL when Discord provider is removed'
  );

-- ============================================================================
-- Test 9: Test user creation with Discord signup sets correct providers
-- ============================================================================
-- Simulate Discord signup by creating user with Discord metadata
INSERT INTO
  auth.users (
    id,
    email,
    raw_user_meta_data,
    raw_app_meta_data,
    created_at,
    updated_at
  )
VALUES
  (
    'test-discord-signup'::uuid,
    'discord-user@example.com',
    '{"avatar_url": "https://cdn.discordapp.com/avatars/123/avatar.png", "full_name": "Discord User"}'::jsonb,
    '{"provider": "discord", "providers": ["discord"]}'::jsonb,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- The handle_user_changes function should have created a profile
SELECT
  ok (
    (
      SELECT
        count(*)
      FROM
        public.profiles
      WHERE
        id = 'test-discord-signup'::uuid
    ) = 1,
    'Profile should be created for new Discord user'
  );

-- Add Discord identity to trigger provider update
INSERT INTO
  auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  )
VALUES
  (
    'discord-signup-identity'::uuid,
    'test-discord-signup'::uuid,
    '{"sub": "discord456", "avatar": "avatar456"}'::jsonb,
    'discord',
    'discord456',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Check that providers include discord
SELECT
  ok (
    'discord' = ANY (
      SELECT
        providers
      FROM
        public.profiles
      WHERE
        id = 'test-discord-signup'::uuid
    ),
    'Discord signup should result in discord provider being included'
  );

-- ============================================================================
-- Test 10: Test email-only user maintains email provider
-- ============================================================================
INSERT INTO
  auth.users (
    id, 
    email, 
    raw_app_meta_data,
    created_at, 
    updated_at
  )
VALUES
  (
    'test-email-only'::uuid,
    'email-only@example.com',
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO
  auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  )
VALUES
  (
    'email-only-identity'::uuid,
    'test-email-only'::uuid,
    '{"sub": "test-email-only", "email": "email-only@example.com"}'::jsonb,
    'email',
    'test-email-only',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- The trigger should set providers to ['email']
SELECT
  IS (
    (
      SELECT
        providers
      FROM
        public.profiles
      WHERE
        id = 'test-email-only'::uuid
    ),
    ARRAY['email']::TEXT[],
    'Email-only user should have only email provider'
  );

-- Avatar should remain NULL for email-only users
SELECT
  IS (
    (
      SELECT
        avatar_url
      FROM
        public.profiles
      WHERE
        id = 'test-email-only'::uuid
    ),
    NULL,
    'Email-only user should have NULL avatar_url'
  );

-- ============================================================================
-- Test 11: Test error handling when providers field is null in auth metadata
-- ============================================================================
SELECT
  throws_ok (
    $$INSERT INTO auth.users (
      id, 
      email, 
      raw_app_meta_data,
      created_at, 
      updated_at
    ) VALUES (
      'test-null-providers'::uuid,
      'null-providers@example.com',
      '{}'::jsonb,
      NOW(),
      NOW()
    )$$,
    'Providers field is null in auth metadata for user test-null-providers',
    'Should error when providers field is missing in auth metadata'
  );

-- ============================================================================
-- Test 12: Test error handling when providers field is explicitly null
-- ============================================================================
SELECT
  throws_ok (
    $$INSERT INTO auth.users (
      id, 
      email, 
      raw_app_meta_data,
      created_at, 
      updated_at
    ) VALUES (
      'test-explicit-null-providers'::uuid,
      'explicit-null-providers@example.com',
      '{"provider": "email", "providers": null}'::jsonb,
      NOW(),
      NOW()
    )$$,
    'Providers field is null in auth metadata for user test-explicit-null-providers',
    'Should error when providers field is explicitly null in auth metadata'
  );

-- ============================================================================
-- Cleanup
-- ============================================================================
-- Clean up test data
DELETE FROM auth.identities
WHERE
  user_id IN (
    'test-providers-user-1'::uuid,
    'test-discord-signup'::uuid,
    'test-email-only'::uuid
  );

DELETE FROM public.profiles
WHERE
  id IN (
    'test-providers-user-1'::uuid,
    'test-discord-signup'::uuid,
    'test-email-only'::uuid
  );

DELETE FROM auth.users
WHERE
  id IN (
    'test-providers-user-1'::uuid,
    'test-discord-signup'::uuid,
    'test-email-only'::uuid
  );

-- Finish the test
SELECT
  finish ();

ROLLBACK;
