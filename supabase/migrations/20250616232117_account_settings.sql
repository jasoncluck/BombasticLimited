CREATE OR REPLACE FUNCTION check_unique_username(p_username uuid)
RETURNS boolean AS $$
DECLARE
    username_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM auth.users
        WHERE user_metadata->>'username' = p_username
    ) INTO username_exists;

    RETURN NOT username_exists; -- Return true if username does not exist
END;
$$ LANGUAGE plpgsql;
