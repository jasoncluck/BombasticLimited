-- Tests for user profile management functions
-- Validates username validation and generation functions
BEGIN;

SELECT
  plan (10);

-- Test that user profile functions exist
SELECT
  has_function (
    'public',
    'is_unique_username',
    ARRAY['text'],
    'Function is_unique_username should exist'
  );

SELECT
  has_function (
    'public',
    'generate_unique_username',
    ARRAY['text', 'uuid'],
    'Function generate_unique_username should exist'
  );

-- Test username uniqueness with non-existent user
SELECT
  ok (
    public.is_unique_username ('nonexistentuser123') = TRUE,
    'is_unique_username should return true for non-existent username'
  );

-- Test username generation
SELECT
  ok (
    public.generate_unique_username ('newuser') = 'newuser',
    'generate_unique_username should return same username if unique'
  );

-- Test that generated username is valid
SELECT
  ok (
    length(public.generate_unique_username ('test')) >= 3,
    'Generated usernames should meet minimum length requirements'
  );

-- Test empty string handling
SELECT
  ok (
    length(public.generate_unique_username ('')) >= 3,
    'Generated username for empty string should meet minimum length'
  );

-- Test basic functionality
SELECT
  ok (
    public.generate_unique_username ('test', NULL) IS NOT NULL,
    'Function should work with NULL exclude_user_id'
  );

-- Test special characters handling  
SELECT
  ok (
    public.generate_unique_username ('user@domain') ~ '^[a-z0-9]+$',
    'Generated username should only contain alphanumeric characters'
  );

-- Test username length constraints
SELECT
  ok (
    length(
      public.generate_unique_username ('verylongusernamethatexceedslimits')
    ) <= 50,
    'Generated username should not exceed maximum length'
  );

-- Test case handling
SELECT
  ok (
    lower(public.generate_unique_username ('TestUser')) = public.generate_unique_username ('TestUser'),
    'Generated username should be lowercase'
  );

SELECT
  finish ();

ROLLBACK;
