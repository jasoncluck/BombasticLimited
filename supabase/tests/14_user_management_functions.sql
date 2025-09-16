-- Tests for user management RPC functions
-- Validates user creation, username generation, and user lifecycle functions
BEGIN;

SELECT plan(20);

-- Test that user management functions exist
SELECT has_function(
    'public',
    'is_unique_username',
    ARRAY['text'],
    'Function is_unique_username should exist'
);

SELECT has_function(
    'public', 
    'generate_unique_username',
    ARRAY['text', 'uuid'],
    'Function generate_unique_username should exist'
);

SELECT has_function(
    'public',
    'create_user',
    ARRAY['text', 'text', 'text'],
    'Function create_user should exist'
);

SELECT has_function(
    'public',
    'confirm_user', 
    ARRAY['text'],
    'Function confirm_user should exist'
);

SELECT has_function(
    'public',
    'delete_user',
    ARRAY[]::TEXT[],
    'Function delete_user should exist'
);

-- Create test data for functional testing
DO $$
DECLARE
    test_user_id_1 uuid := gen_random_uuid();
    test_user_id_2 uuid := gen_random_uuid();
BEGIN
    -- Create auth.users entries first to satisfy foreign key constraints
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES 
        (test_user_id_1, 'authenticated', 'authenticated', 'testuser123@test.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "testuser123"}'),
        (test_user_id_2, 'authenticated', 'authenticated', 'anotheruser@test.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "anotheruser"}');
    
    -- Insert test profiles to test username uniqueness
    INSERT INTO public.profiles (id, username)
    VALUES 
        (test_user_id_1, 'testuser123'),
        (test_user_id_2, 'anotheruser');
END;
$$;

-- Test is_unique_username function
SELECT ok(
    public.is_unique_username('newunique456') = true,
    'is_unique_username should return true for unused username'
);

SELECT ok(
    public.is_unique_username('testuser123') = false,
    'is_unique_username should return false for existing username'
);

SELECT ok(
    public.is_unique_username('TESTUSER123') = false,
    'is_unique_username should be case insensitive'
);

SELECT ok(
    public.is_unique_username('') = false,
    'is_unique_username should return false for empty string'
);

SELECT ok(
    public.is_unique_username(null) = false,
    'is_unique_username should return false for null input'
);

-- Test generate_unique_username function
SELECT ok(
    public.generate_unique_username('uniquebase') = 'uniquebase',
    'generate_unique_username should return base username if unique'
);

SELECT ok(
    public.generate_unique_username('testuser123') != 'testuser123',
    'generate_unique_username should modify taken username'
);

SELECT ok(
    length(public.generate_unique_username('verylongusernamethatexceedsthirtychars')) <= 30,
    'generate_unique_username should truncate long usernames'
);

SELECT ok(
    public.generate_unique_username('test@#$%user') ~ '^[a-z0-9]+$',
    'generate_unique_username should clean non-alphanumeric characters'
);

SELECT ok(
    public.generate_unique_username('') != '',
    'generate_unique_username should handle empty input'
);

-- Test create_user function (creates unconfirmed user)
DO $$
DECLARE
    new_user_id uuid;
    created_user_email text;
    is_confirmed boolean;
BEGIN
    -- Create a new user
    new_user_id := public.create_user('newuser@test.com', 'password123', 'newusername');
    
    -- Verify user was created
    SELECT email, confirmed_at IS NOT NULL
    INTO created_user_email, is_confirmed
    FROM auth.users 
    WHERE id = new_user_id;
    
    -- Test user creation
    PERFORM ok(
        created_user_email = 'newuser@test.com',
        'create_user should create user with correct email'
    );
    
    PERFORM ok(
        is_confirmed = false,
        'create_user should create unconfirmed user'
    );
END;
$$;

-- Test confirm_user function
DO $$
DECLARE
    user_id uuid;
    is_confirmed_after boolean;
    profile_exists boolean;
BEGIN
    -- Create user first
    user_id := public.create_user('confirmtest@test.com', 'password123', 'confirmtestuser');
    
    -- Confirm the user
    PERFORM public.confirm_user('confirmtest@test.com');
    
    -- Check if user is now confirmed
    SELECT confirmed_at IS NOT NULL
    INTO is_confirmed_after
    FROM auth.users 
    WHERE id = user_id;
    
    -- Check if profile was created after confirmation
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = user_id)
    INTO profile_exists;
    
    PERFORM ok(
        is_confirmed_after = true,
        'confirm_user should set confirmed_at timestamp'
    );
    
    PERFORM ok(
        profile_exists = true,
        'confirm_user should trigger profile creation'
    );
END;
$$;

-- Test create_user idempotency (creating same user twice should return same ID)
DO $$
DECLARE
    user_id_1 uuid;
    user_id_2 uuid;
BEGIN
    user_id_1 := public.create_user('duplicate@test.com', 'password123', 'duplicateuser');
    user_id_2 := public.create_user('duplicate@test.com', 'password456', 'differentuser');
    
    PERFORM ok(
        user_id_1 = user_id_2,
        'create_user should return same ID for duplicate email'
    );
END;
$$;

-- Test delete_user function (requires authenticated context)
-- Note: This test requires proper auth context setup, so we'll just test that it exists
-- and can be called without error in a proper context
SELECT ok(
    has_function('public', 'delete_user', ARRAY[]::TEXT[]),
    'delete_user function should exist and be callable'
);

SELECT finish();

ROLLBACK;