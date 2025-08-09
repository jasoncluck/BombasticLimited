# Soft Delete Implementation for Playlists

## Overview

This implementation replaces hard deletes with soft deletes for playlists,
allowing for better data recovery, audit trails, and user experience while
maintaining backward compatibility.

## Implementation Details

### Database Schema Changes

- Added `deleted_at` TIMESTAMP column to `playlists` table (nullable, defaults
  to NULL)
- Created performance index on `deleted_at` column for efficient filtering
- NULL value indicates active playlist, non-NULL timestamp indicates
  soft-deleted playlist

### Function Updates

#### Updated `delete_playlist` Function

- **Owner behavior**: When playlist owner deletes a playlist:
  - Sets `deleted_at = NOW()` on the playlist record
  - Removes ALL user mappings from `user_playlists` (all users lose access)
  - No position reordering needed since all users lose the playlist
- **Follower behavior**: When a follower "deletes" (unfollows) a playlist:
  - Only removes their mapping from `user_playlists`
  - Reorders remaining playlist positions for that user
  - Playlist remains active for other users

#### Updated Query Functions

All playlist query functions now filter out soft-deleted playlists with
`WHERE deleted_at IS NULL`:

- `get_playlist_data` - Main playlist + videos query
- `get_playlist_by_youtube_id` - Lookup by YouTube ID
- `get_user_playlists` - User's playlist collection
- `get_playlists_for_username` - Public playlists for a username
- `search_playlists` - Playlist search functionality
- `get_playlist_video_context` - Video context within playlist

#### New Administrative Function

- `restore_playlist(p_playlist_id)` - Restores soft-deleted playlist by setting
  `deleted_at = NULL`

### Benefits

1. **Data Recovery**: Accidentally deleted playlists can be restored
2. **Audit Trail**: Deletion timestamps provide historical data
3. **User Experience**: Same deletion behavior from user perspective
4. **Performance**: Indexed soft delete column ensures efficient queries
5. **Backward Compatibility**: No breaking changes to existing functionality

### Migration Files

- `20250805151300_10_soft_delete_playlists.sql` - Schema changes and core
  functions
- `20250805151301_11_soft_delete_playlists_queries.sql` - Updated query
  functions

### Testing

- All existing unit tests pass without modification
- Build compiles successfully
- Logic verified with manual testing
- SQL syntax validated

## Deployment Notes

1. Run migrations in order (10, then 11)
2. Regenerate TypeScript database types after migration
3. No application code changes required
4. Existing playlists remain unaffected (deleted_at = NULL)

## Future Considerations

- Could add cleanup job to permanently delete old soft-deleted playlists
- Could add admin interface to view/restore soft-deleted playlists
- Could extend soft delete pattern to other entities if needed
