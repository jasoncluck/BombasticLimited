# Bombastic Notifications System

This document describes the comprehensive notifications system implemented for
the Bombastic application.

## Features

### ✅ Implemented

- **Complete database schema** with notifications and preferences tables
- **Comprehensive UI components** for notifications bell, dropdown, and
  preferences
- **Real-time toast notifications** using Sonner with rich content and actions
- **User preference management** with toggle controls for different notification
  types
- **Demo system** for testing all notification features
- **Mobile responsive design** with drawer components for mobile
- **TypeScript types** for all notification entities
- **Service layer** ready for backend integration

### 🚧 Pending (requires database migration)

- Database migration application and real data integration
- Real-time subscriptions using Supabase realtime
- Backend functions for creating and managing notifications
- Pagination for large notification lists
- Email and push notification delivery methods

## Components

### NotificationBell

Located in `/src/lib/components/notifications/notification-bell.svelte`

- Bell icon with unread count badge
- Desktop dropdown menu and mobile drawer
- Integrated with user menu in navigation

### NotificationList

Located in `/src/lib/components/notifications/notification-list.svelte`

- Displays paginated list of notifications
- Mark as read/unread functionality
- Delete notifications
- Different icons and colors for notification types
- Infinite scroll loading

### NotificationPreferences

Located in `/src/lib/components/notifications/notification-preferences.svelte`

- Toggle controls for different notification types
- Delivery method preferences (email, push - coming soon)
- Demo testing buttons for all notification types
- Save/reset functionality

## Database Schema

### Tables

- `notifications` - stores individual notifications with type, title, message,
  metadata
- `notification_preferences` - user preferences for different notification types

### Types

- `system` - Important system announcements and maintenance notices
- `content` - New videos, content updates, featured content
- `user` - User interactions, follows, friend requests
- `playlist_update` - Changes to followed playlists
- `mention` - When user is mentioned in comments

## Service Layer

### NotificationService

Located in `/src/lib/services/notification-service.ts`

- CRUD operations for notifications
- Preference management
- Real-time subscription handling
- Currently stubbed, ready for database integration

### NotificationManager

Located in `/src/lib/stores/notification.ts`

- Svelte store-based state management
- Real-time updates and synchronization
- Toast notification triggers
- Demo data integration

## Demo System

### Testing Features

The notification preferences page includes demo buttons to test:

- All notification types (system, content, user, playlist, mention)
- Real-time notification simulation
- Toast notification display with actions
- Bell badge count updates

### Demo Data

Located in `/src/lib/utils/demo-notifications.ts`

- Realistic notification examples
- Different timestamps and read states
- Proper metadata for each notification type

## Usage

### Adding to User Menu

The notification bell is automatically included in the user menu when a user is
authenticated:

```svelte
<NotificationBell {supabase} bind:openNotificationDrawer />
```

### Navigation to Preferences

Users can access notification preferences from:

- Account settings page → "Manage Notifications" button
- Direct URL: `/account/notifications`

### Testing Notifications

1. Navigate to `/account/notifications`
2. Use the demo buttons to test different notification types
3. Observer the bell badge count updates
4. Check toast notifications appear with rich content

## Migration Steps

To activate the full system:

1. **Apply database migration**:

   ```bash
   supabase db push
   npm run generate-types
   ```

2. **Update service layer** to use real database calls instead of stubs

3. **Enable realtime subscriptions** for live notification updates

4. **Implement notification creation triggers** for content updates, user
   actions, etc.

## File Structure

```
src/lib/
├── components/notifications/
│   ├── notification-bell.svelte       # Bell icon with dropdown/drawer
│   ├── notification-list.svelte       # Notification list component
│   └── notification-preferences.svelte # Settings page component
├── services/
│   └── notification-service.ts        # Database service layer
├── stores/
│   └── notification.ts               # State management and toast integration
├── supabase/
│   └── notifications.ts              # TypeScript types
└── utils/
    └── demo-notifications.ts         # Demo data and testing utilities

supabase/migrations/
└── 20250120000000_11_notifications_system.sql  # Database schema

src/routes/account/notifications/
├── +page.server.ts                   # Server-side auth check
└── +page.svelte                      # Preferences page
```

## Architecture

The notification system follows the existing Bombastic patterns:

- **Svelte 5 Runes** for reactive state management
- **shadcn-svelte** for consistent UI components
- **Supabase** for database and real-time functionality
- **TypeScript** for type safety
- **Sonner** for rich toast notifications
- **Mobile-first responsive design**

## Next Steps

1. Apply the database migration when ready
2. Implement real notification triggers for content updates
3. Add notification creation points throughout the app
4. Implement email/push notification delivery
5. Add comprehensive test coverage
