# Global Notifications Guide

This guide explains how to send notifications to all users in the Bombastic
application.

## Methods for Sending Global Notifications

### 1. Via Database Migrations (Recommended for scheduled/planned notifications)

For planned notifications like maintenance announcements, feature releases, or
welcome messages, use database migrations:

1. Create a new migration file:

```sql
-- Example: 20250121000000_welcome_notification.sql
SELECT
  public.create_notification_for_all_users (
    'system',
    'Welcome to Bombastic!',
    'Thanks for being part of our community. Enjoy exploring content from your favorite creators.',
    '{"source": "admin_welcome", "version": "2.0"}',
    '/account/notifications'
  );
```

2. Apply the migration:

```bash
supabase migration up
```

**Template Migration:** See
`supabase/migrations/20250120000001_12_global_notification_examples.sql` for
more examples.

### 2. Via RPC Functions (For programmatic use)

For dynamic notifications that need to be sent from the application:

```typescript
import {
  sendGlobalNotification,
  sendTemplateNotification,
} from '$lib/utils/global-notifications';

// Custom notification
const result = await sendGlobalNotification(
  supabase,
  'system',
  'New Feature Released!',
  'Check out our enhanced playlist features.',
  { source: 'feature_release', feature: 'playlists' },
  '/features/playlists'
);

// Using a predefined template
const result = await sendTemplateNotification(supabase, 'welcome', {
  message: 'Welcome to Bombastic v2.0! Enjoy our new features.',
});
```

### 3. Direct Database Function Call

You can also call the function directly via SQL:

```sql
SELECT
  public.create_notification_for_all_users (
    'content'::notification_type,
    'New Video Available',
    'Your favorite creator just uploaded a new video!',
    '{"creator": "example_creator"}',
    '/videos/latest'
  );
```

## Notification Types

- `system`: System announcements, maintenance notices, important updates
- `content`: New content alerts, feature announcements, content-related updates
- `user`: User-related notifications, community updates
- `playlist_update`: Playlist changes, collaborative updates
- `mention`: When users are mentioned (typically not used for global
  notifications)

## User Preferences

The `create_notification_for_all_users` function automatically respects each
user's notification preferences. Users who have disabled a specific notification
type will not receive notifications of that type.

## Best Practices

1. **Use appropriate notification types** - Match the type to the content
2. **Respect user preferences** - The system automatically filters based on user
   settings
3. **Include actionable URLs** - Provide links where users can learn more or
   take action
4. **Use meaningful metadata** - Include context that might be useful for
   filtering or analytics
5. **Test before sending** - Use the demo functions in development to test your
   notifications

## Testing

Use the notification preferences page (`/account/notifications`) to test the
notification system with demo notifications before sending real global
notifications.

## Migration vs RPC Usage

**Use Migrations for:**

- Scheduled maintenance notifications
- Feature release announcements
- One-time system updates
- Historical notifications that should be part of the schema

**Use RPC Functions for:**

- Dynamic notifications triggered by user actions
- Automated notifications based on events
- Admin tools for sending notifications
- Real-time announcements

## Example Migration Template

```sql
-- Replace this with your actual notification
SELECT
  public.create_notification_for_all_users (
    'system'::notification_type,
    'Your Title Here',
    'Your message content here.',
    '{"source": "your_source", "additional": "metadata"}'::jsonb,
    '/your/action/url'
  );
```

Remember to test notifications in a development environment before applying to
production!
