-- ============================================================================
-- User Profile and Lifecycle Functions Unit Tests
-- ============================================================================
-- This test suite verifies the user profile and lifecycle functions
-- from migrations 08a and 08b using pgTAP testing framework
-- Functions tested:
-- - is_unique_username()
-- - generate_unique_username()
-- - handle_user_changes() [trigger function]
-- - create_user()
-- - delete_user()

BEGIN;

-- Plan the number of tests
SELECT plan(18);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================

-- Create test users for our tests
INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'test1@example.com',
  NOW(),
  NOW(),
  '{"full_name": "Test User One"}'::jsonb
), (
  '22222222-2222-2222-2222-222222222222'::uuid,
  'test2@example.com',
  NOW(),
  NOW(),
  '{"full_name": "Test User Two"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Create corresponding profiles
INSERT INTO public.profiles (id, username)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'existinguser'
), (
  '22222222-2222-2222-2222-222222222222'::uuid,
  'anotheruser'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test 1-4: is_unique_username() Function
-- ============================================================================

SELECT is(
  public.is_unique_username('existinguser'),
  false,
  'is_unique_username returns false for existing username'
);

SELECT is(
  public.is_unique_username('EXISTINGUSER'),
  false,
  'is_unique_username is case-insensitive for existing username'
);

SELECT is(
  public.is_unique_username('uniqueusername123'),
  true,
  'is_unique_username returns true for non-existing username'
);

SELECT is(
  public.is_unique_username(''),
  true,
  'is_unique_username returns true for empty string'
);

-- ============================================================================
-- Test 5-10: generate_unique_username() Function
-- ============================================================================

SELECT ok(
  public.generate_unique_username('newuser') = 'newuser',
  'generate_unique_username returns clean username when available'
);

SELECT ok(
  public.generate_unique_username('existinguser') != 'existinguser',
  'generate_unique_username modifies existing username'
);

SELECT ok(
  public.generate_unique_username('existinguser') LIKE 'existinguser%',
  'generate_unique_username adds suffix to existing username'
);

SELECT ok(
  length(public.generate_unique_username('this_is_a_very_long_username_that_exceeds_thirty_characters')) <= 30,
  'generate_unique_username respects 30 character limit'
);

SELECT ok(
  public.generate_unique_username('!!!@@@###') = 'user',
  'generate_unique_username uses fallback for invalid characters'
);

SELECT ok(
  public.generate_unique_username('') = 'user',
  'generate_unique_username uses fallback for empty input'
);

-- ============================================================================
-- Test 11-13: create_user() Function
-- ============================================================================

DO $$
DECLARE
  new_user_id uuid;
  profile_exists boolean;
BEGIN
  -- Test creating a new user
  SELECT public.create_user('newuser@example.com', 'password123', 'testcreateuser') INTO new_user_id;
  
  -- Verify user was created in auth.users
  IF EXISTS(SELECT 1 FROM auth.users WHERE id = new_user_id AND email = 'newuser@example.com') THEN
    PERFORM ok(true, 'create_user successfully creates user in auth.users');
  ELSE
    PERFORM ok(false, 'create_user failed to create user in auth.users');
  END IF;
  
  -- Verify profile was created via trigger
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = new_user_id) INTO profile_exists;
  PERFORM ok(profile_exists, 'create_user triggers profile creation');
  
  -- Clean up
  DELETE FROM public.profiles WHERE id = new_user_id;
  DELETE FROM auth.identities WHERE user_id = new_user_id;
  DELETE FROM auth.users WHERE id = new_user_id;
END $$;

-- Test create_user with duplicate email
DO $$
DECLARE
  existing_user_id uuid;
  duplicate_user_id uuid;
BEGIN
  -- Create first user
  SELECT public.create_user('duplicate@example.com', 'password123', 'firstuser') INTO existing_user_id;
  
  -- Try to create user with same email
  SELECT public.create_user('duplicate@example.com', 'password456', 'seconduser') INTO duplicate_user_id;
  
  -- Should return the existing user ID
  PERFORM is(existing_user_id, duplicate_user_id, 'create_user handles duplicate email by returning existing user');
  
  -- Clean up
  DELETE FROM public.profiles WHERE id = existing_user_id;
  DELETE FROM auth.identities WHERE user_id = existing_user_id;
  DELETE FROM auth.users WHERE id = existing_user_id;
END $$;

-- ============================================================================
-- Test 14-15: handle_user_changes() Trigger Function
-- ============================================================================

DO $$
DECLARE
  trigger_user_id uuid := '33333333-3333-3333-3333-333333333333'::uuid;
  profile_username text;
BEGIN
  -- Insert user which should trigger profile creation
  INSERT INTO auth.users (id, email, created_at, updated_at, raw_user_meta_data)
  VALUES (
    trigger_user_id,
    'triggertest@example.com',
    NOW(),
    NOW(),
    '{"full_name": "Trigger Test User"}'::jsonb
  );
  
  -- Check if profile was created
  SELECT username INTO profile_username FROM public.profiles WHERE id = trigger_user_id;
  
  IF profile_username IS NOT NULL THEN
    PERFORM ok(true, 'handle_user_changes trigger creates profile on user insert');
    PERFORM ok(
      profile_username LIKE 'triggertestuser%' OR profile_username LIKE 'triggertest%',
      'handle_user_changes generates username from full_name or email'
    );
  ELSE
    PERFORM ok(false, 'handle_user_changes trigger failed to create profile');
    PERFORM ok(false, 'handle_user_changes username generation failed');
  END IF;
  
  -- Clean up
  DELETE FROM public.profiles WHERE id = trigger_user_id;
  DELETE FROM auth.users WHERE id = trigger_user_id;
END $$;

-- ============================================================================
-- Test 16-18: delete_user() Function (Authentication required)
-- ============================================================================

-- Note: delete_user() requires auth.uid() which won't work in test context
-- We'll test the function structure and error handling instead

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'delete_user'),
  'delete_user function exists'
);

-- Test that delete_user function has proper security definer
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'delete_user' AND pronamespace = 'public'::regnamespace),
  true,
  'delete_user function is marked as SECURITY DEFINER'
);

-- Test function signature
SELECT is(
  (SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'delete_user' AND pronamespace = 'public'::regnamespace),
  '',
  'delete_user function has no parameters'
);

-- ============================================================================
-- Test Cleanup
-- ============================================================================

-- Clean up test users and profiles
DELETE FROM public.profiles WHERE id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

DELETE FROM auth.users WHERE id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

-- Finish the test suite
SELECT * FROM finish();

ROLLBACK;