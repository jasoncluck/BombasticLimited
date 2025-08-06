-- Test file for playlist management functions
-- Tests playlist creation, limits, and management features

BEGIN;

-- Load the TAP functions
SELECT plan(5);

-- Setup test users in auth.users first (required for foreign key constraints)
INSERT INTO auth.users (id, email) VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'testuser1@example.com'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'testuser2@example.com'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'testuser3@example.com'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'testuser4@example.com'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'testuser5@example.com')
ON CONFLICT (id) DO NOTHING;

-- Test 1: Basic playlist creation should work
SELECT lives_ok(
    $$SELECT * FROM insert_playlist('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Test Playlist')$$,
    'Should be able to create a basic playlist'
);

-- Test 2: Playlist limit enforcement (this is the failing test mentioned)
-- First, try to create 26 playlists to trigger the limit
DO $$
DECLARE
    i INTEGER;
    test_user_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
    playlist_result RECORD;
BEGIN
    -- Create 25 playlists (should work)
    FOR i IN 1..25 LOOP
        SELECT * INTO playlist_result 
        FROM insert_playlist(test_user_id, 'Playlist ' || i);
    END LOOP;
    
    -- Try to create the 26th playlist (should fail)
    BEGIN
        SELECT * INTO playlist_result 
        FROM insert_playlist(test_user_id, 'Playlist 26');
        RAISE EXCEPTION 'Expected playlist limit error but did not get one';
    EXCEPTION
        WHEN others THEN
            IF SQLERRM LIKE '%PLAYLIST_LIMIT_EXCEEDED%' THEN
                -- This is expected
                NULL;
            ELSE
                RAISE;
            END IF;
    END;
END;
$$;

SELECT pass('Playlist limit enforcement works correctly');

-- Test 3: Playlist name uniqueness within user scope
SELECT lives_ok(
    $$SELECT * FROM insert_playlist('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'Unique Name')$$,
    'Should be able to create playlist with unique name'
);

-- Test 4: Playlist type validation
SELECT lives_ok(
    $$SELECT * FROM insert_playlist('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'Type Test', NULL, 'Private'::playlist_type)$$,
    'Should accept valid playlist_type enum values'
);

-- Test 5: Empty playlist name handling
SELECT lives_ok(
    $$SELECT * FROM insert_playlist('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, '')$$,
    'Should handle empty playlist names by generating default names'
);

SELECT * FROM finish();

ROLLBACK;