# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What This Is

Bombastic is a SvelteKit web application that aggregates video content from
gaming media creators (Giant Bomb, Jeff Gerstmann, Nextlander, Remap). Users can
browse videos by source, manage playlists, track watch history (continue
watching), and search across content. It deploys to Vercel and uses Supabase as
its backend.

## Commands

```bash
# Development
npm run dev                  # Start dev server
npm run dev:no-processing    # Dev server with image processing disabled

# Build & validate
npm run build                # Format + type check + build
npm run check                # Svelte type check only
npm run format               # Format all files with Prettier
npm run lint                 # Prettier check + ESLint

# Testing
npm run test                 # Run all unit/integration tests (watch mode)
npm run test:ci              # Run tests once with coverage
npm run test:unit            # Unit tests only (src/lib/)
npm run test:integration     # Integration tests only (src/routes/)
npx vitest run src/path/to/file.test.ts  # Run a single test file

# E2E tests
npm run test:e2e             # Run all Playwright tests
npm run test:e2e:headed      # Run with browser visible
npm run test:e2e:single -- --grep "test name"  # Run a specific test

# Database
supabase start               # Start local Supabase stack
supabase stop                # Stop local Supabase stack
supabase db reset            # Re-apply all migrations and seed data
supabase status              # Print local API keys and URLs
npm run generate-types       # Regenerate src/lib/supabase/database.types.ts
npm run test:sql             # Run SQL tests
```

## Architecture

### Tech Stack

- **SvelteKit** with Svelte 5 (runes), TypeScript, Tailwind CSS v4
- **Supabase** (@supabase/ssr) for database, auth, and storage
- **Vercel** deployment via `@sveltejs/adapter-vercel`
- **Trigger.dev** for background jobs (image processing worker in
  `src/trigger/`)
- **Vitest** + **Playwright** for testing
- **MDsveX** for Markdown support (`.md`/`.svx` files)

### Route Structure

All main app routes live under `src/routes/(app)/`. Key routes:

- `/` and `/[source]` — Home feed and per-source feeds (giantbomb, nextlander,
  remap, jeffgerstmann)
- `/video/[id]` — Video player page
- `/playlist/[shortId]` and `/playlist/[shortId]/video/[videoId]` — Playlist
  view with video player
- `/continue` — Continue watching view
- `/search/[query]` — Search results
- `/profile/[username]/playlists` — User profile playlists
- `/account` — Account settings (auth-guarded)
- `/auth/*` — Login, signup, forgot password, verify flows
- `src/routes/(docs)/` — Documentation pages (MDsveX)
- `src/routes/(app)/api/*` — API endpoints: save-timestamp, navigation,
  video-thumbnail, sidebar, admin/notifications

### Authentication & Supabase Client Lifecycle

`hooks.server.ts` runs two sequential handles:

1. `supabase` — Creates a per-request Supabase client stored in
   `event.locals.supabase` using `@supabase/ssr`
2. `authGuard` — Checks claims via `getClaims()`, redirects to `/auth/login` for
   protected routes

The layout load chain (`+layout.server.ts` → `+layout.ts`) passes cookies and
session data down. `+layout.ts` creates a browser-side Supabase client
(`createBrowserClient`) so the client also has access to `supabase` and
`session`.

### Data Layer (`src/lib/supabase/`)

Thin wrappers around Supabase queries organized by domain:

- `videos.ts` — Video queries
- `playlists/` — Playlist queries, mutations, transforms, utils, duration
- `user-profiles.ts` — Profile queries
- `timestamps.ts` — Watch timestamp tracking
- `video-history.ts` — Watch history
- `notifications.ts` — Notification system
- `streams.ts` — Live stream status
- `images.ts` — Image format detection (WebP/AVIF)
- `database.types.ts` — Auto-generated Supabase types (do not edit manually)

### State Management (`src/lib/state/`)

Svelte 5 rune-based reactive state in `.svelte.ts` files. Each file exports a
singleton store:

- `content.svelte.ts`, `playlist.svelte.ts`, `navigation.svelte.ts`,
  `sidebar.svelte.ts`
- `page.svelte.ts`, `source.svelte.ts`, `streaming.svelte.ts`
- `user-preferences.svelte.ts`, `media-query.svelte.ts`,
  `notifications.svelte.ts`

### Content System

The `ContentView` type
(`'default' | 'search' | 'playlist' | 'continueWatching'`) drives filter/sort
behavior throughout. `src/lib/components/content/content.ts` has
`handleContentNavigation` and `generateContentNavigationUrl` which route video
clicks to either `/video/[id]` or `/playlist/[shortId]/video/[videoId]`
depending on context.

Content can be displayed as TILES or TABLE (`ContentDisplay`), and tiles can be
CAROUSEL or grid.

### Sources

The four content sources are defined in `src/lib/constants/source.ts` (`SOURCES`
array and `SOURCE_INFO` record). Each source has Twitch, YouTube, and display
metadata.

### Image Processing

- `src/lib/server/image-processing.ts` — Server-side Sharp processing
- `src/trigger/image-processing-worker.ts` — Trigger.dev background job
- `DISABLE_IMAGE_PROCESSING=true` env var disables processing in dev

### Testing Conventions

- Unit tests (`src/lib/**/*.test.ts`) and integration tests
  (`src/routes/**/*.test.ts`) both run via Vitest
- SvelteKit module aliases (`$app/*`, `$env/*`) are mocked in
  `src/lib/tests/__mocks__/`
- E2E tests live in `tests/e2e/`
- SQL tests: `supabase/tests/`

### Database

PostgreSQL via Supabase. Migrations are in `supabase/migrations/`. Run
`npm run generate-types` after schema changes to regenerate TypeScript types.

## CDK Infrastructure (`cdk/`)

A separate AWS CDK project (TypeScript) that manages backend infrastructure. It
has its own `package.json` and must be installed and run independently from
within the `cdk/` directory.

### What it manages

- **VideoStack** — Lambda functions that sync YouTube videos and playlists into
  Supabase via the YouTube API. Runs on EventBridge schedules (production: every
  30 min for videos, daily for playlists; staging: every 2 hours / weekly).
- **Step Functions** — `RepopulateStateMachine` orchestrates full repopulation
  of all sources one at a time.
- **BackupStack** — Database backup infrastructure (currently disabled in the
  app stack; scripts still work for manual runs).

### CDK Commands

```bash
cd cdk
npm install
npm run build                        # Compile TypeScript
npm run deploy                       # Deploy all stacks
npm run deploy:production            # Deploy BombifyStack-Production
npm run deploy:staging               # Deploy BombifyStack-Staging
npx cdk diff                         # Preview changes vs deployed state
npx cdk synth                        # Emit CloudFormation template

# Repopulate database from YouTube API
npm run repopulate                   # All sources, staging
npm run repopulate:production        # All sources, production
npm run repopulate:videos            # Videos only
npm run repopulate:playlists         # Playlists only

# Database backup/restore (manual)
npm run backup                       # Full backup to S3
npm run backup:dry-run               # Test without uploading
npm run restore                      # Restore from S3

npm run test                         # Jest unit tests
```

### Required environment variables for CDK

```
GOOGLE_API_KEY
PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_API_KEY
```

The CDK project imports `src/lib/supabase/database.types.ts` from the main
project root, so both packages share the same source enum types.
