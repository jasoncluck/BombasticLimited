-- Test file for user functions
-- Tests user management and username validation functions
BEGIN;

SELECT
  plan (6);

-- Setup test users in auth.users first
INSERT INTO
  auth.users (id, email)
VALUES
  (
    '77777777-7777-7777-7777-777777777777',
    'existinguser@example.com'
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    'anotheruser@example.com'
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'newuser@example.com'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO
  public.profiles (id, username)
VALUES
  (
    '77777777-7777-7777-7777-777777777777',
    'existinguser'
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    'anotheruser'
  )
ON CONFLICT (id) DO NOTHING;

-- Test 1: is_unique_username should return FALSE for existing username
-- This addresses the "is_unique_username tests failing - returning true instead of false" issue
SELECT
  IS (
    public.is_unique_username ('existinguser'),
    FALSE,
    'is_unique_username should return FALSE for existing username'
  );

-- Test 2: is_unique_username should return TRUE for non-existing username
SELECT
  IS (
    public.is_unique_username ('newuniqueuser'),
    TRUE,
    'is_unique_username should return TRUE for non-existing username'
  );

-- Test 3: is_unique_username should be case-insensitive  
SELECT
  IS (
    public.is_unique_username ('EXISTINGUSER'),
    FALSE,
    'is_unique_username should be case-insensitive'
  );

-- Test 4: generate_unique_username should work with base username
SELECT
  matches (
    public.generate_unique_username ('testbase'),
    '^testbase',
    'generate_unique_username should start with base username'
  );

-- Test 5: generate_unique_username should handle existing usernames by adding numbers
SELECT
  matches (
    public.generate_unique_username ('existinguser'),
    '^existinguser',
    'generate_unique_username should handle existing usernames'
  );

-- User creation should trigger profile creation automatically via the trigger
-- The trigger creates profiles when users are created, let's check if it was created
SELECT
  isnt (
    (
      SELECT
        username
      FROM
        public.profiles
      WHERE
        id = '99999999-9999-9999-9999-999999999999'
    ),
    NULL,
    'User creation should trigger automatic profile creation'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
