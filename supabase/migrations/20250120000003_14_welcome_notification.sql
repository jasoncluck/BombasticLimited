-- Migration: 14_welcome_notification.sql
-- Purpose: Add welcome notification system for new users only

-- Function to create a welcome notification for new users
CREATE OR REPLACE FUNCTION public.create_welcome_notification_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert welcome notification for the new user
    INSERT INTO public.notifications (
        user_id, 
        type, 
        title, 
        message, 
        metadata
    ) VALUES (
        NEW.id,
        'system',
        'Welcome to Bombastic!',
        'Thanks for joining our community! Explore playlists, discover great content, and enjoy your experience.<br><br>Get started by browsing our <a href="/playlists">featured playlists</a> or <a href="/account">customizing your preferences</a>.',
        '{"source": "welcome_new_user", "is_welcome": true}'::jsonb
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create welcome notification when a user is created
-- This runs after the notification preferences are created
CREATE TRIGGER create_welcome_notification_on_user_creation
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_welcome_notification_for_new_user();

COMMENT ON FUNCTION public.create_welcome_notification_for_new_user() IS 'Creates a welcome notification for newly registered users';
COMMENT ON TRIGGER create_welcome_notification_on_user_creation ON auth.users IS 'Automatically sends welcome notification to new users';