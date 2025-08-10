-- Migration: 12_global_notification_examples.sql
-- Purpose: Example migration showing how to send global notifications via migrations
-- This is a template/example migration for creating system-wide notifications
-- Example 1: Welcome notification for all users
-- Uncomment and modify as needed for your specific use case
/*
SELECT public.create_notification_for_all_users(
'system',
'Welcome to Bombastic!',
'Thanks for being part of our community. Enjoy exploring the latest content from your favorite creators.',
'{"source": "admin_welcome", "version": "1.0"}',
'/account/notifications'
);
*/
-- Example 2: Maintenance notification
-- Uncomment and modify as needed for your specific use case
/*
SELECT public.create_notification_for_all_users(
'system',
'Scheduled Maintenance',
'We will be performing scheduled maintenance tonight from 2:00 AM to 4:00 AM EST. Some features may be temporarily unavailable.',
'{"source": "admin_maintenance", "maintenance_window": "2024-01-21T02:00:00Z"}',
'/support/maintenance'
);
*/
-- Example 3: New feature announcement
-- Uncomment and modify as needed for your specific use case
/*
SELECT public.create_notification_for_all_users(
'content',
'New Feature: Enhanced Playlists',
'Check out our new playlist features including collaborative editing and smart recommendations!',
'{"source": "feature_announcement", "feature": "enhanced_playlists"}',
'/features/playlists'
);
*/
-- How to use this migration:
-- 1. Create a new migration file based on this template
-- 2. Uncomment and modify one or more examples above
-- 3. Update the notification type, title, message, metadata, and action URL
-- 4. Apply the migration to send notifications to all users
-- 5. The create_notification_for_all_users function will respect each user's notification preferences
-- Available notification types:
-- - 'system': System announcements, maintenance notices
-- - 'content': New content, feature announcements  
-- - 'user': User-related notifications
-- - 'playlist_update': Playlist changes
-- - 'mention': When users are mentioned
-- Note: This migration contains only examples and doesn't execute any actual notifications.
-- Remove this comment and uncomment the examples you want to use.
