# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What This Is

Bombastic Limited is a SvelteKit web application that aggregates video content
from gaming media creators (Giant Bomb, Jeff Gerstmann, Nextlander, Remap).
Users can browse videos by source, manage playlists, track watch history
(continue watching), and search across content.

It originally ran on Vercel + Supabase. As of September 2026 it's fully migrated
off both: hosting is SvelteKit's Node build running in a Lambda container image
behind CloudFront, the database is Neon (serverless Postgres), and auth is AWS
Cognito (with Discord federated as a generic OIDC provider). See "Migration
history" below for why, and for some non-obvious platform gotchas worth knowing
before touching auth or the SSR Lambda.

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
```

Note: `tests/e2e/utils/TestDataManager.ts` still calls the Supabase Admin API (a
genuine, still-installed dependency — the old Supabase project it pointed to is
deleted, so these calls fail) and hasn't been rewritten for Cognito yet — e2e
tests that create/delete users are currently broken. Everything else
(unit/integration) runs fine.

## Architecture

### Tech Stack

- **SvelteKit** with Svelte 5 (runes), TypeScript, Tailwind CSS v4
- **Neon** (serverless Postgres) via its PostgREST-compatible Data API
  (`@neondatabase/postgrest-js`) for client- and most server-side queries; raw
  `pg` (`src/lib/server/db.ts`) for server-only operations that need to bypass
  RLS (account deletion, profile creation)
- **AWS Cognito** for auth, with Discord as a federated OIDC identity provider.
  Cognito's Discord integration never exposes a real username or avatar
  (confirmed empirically — Discord's OIDC userinfo endpoint only returns
  `sub`/`email`), so `src/lib/server/discord.ts` calls Discord's REST API
  directly with a bot token to get those.
- **S3** for content thumbnails and bug-report uploads
- **AWS Lambda** (container image, via Lambda Web Adapter) + **CloudFront** for
  hosting the SSR app; **AWS Lambda + EventBridge** for background jobs (YouTube
  catalog sync, Twitch polling, image processing, cleanup)
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
- `/auth/*` — Login, signup, forgot password, verify, Discord callback/link
- `src/routes/(docs)/` — Documentation pages (MDsveX)
- `src/routes/(app)/api/*` — API endpoints: save-timestamp, navigation, sidebar,
  profile, bug-report, username-available, admin/notifications

### Auth & Session Lifecycle

`src/hooks.server.ts` does three things per request:

1. Verifies the request actually came through CloudFront (checks an
   `x-origin-verify` header against a shared secret) — see "CloudFront / Lambda
   gotchas" below for why this exists.
2. Resolves the session from cookies (`src/lib/server/session.ts`) and builds a
   `NeonPostgrestClient` for `event.locals.neon`, using the real user's token if
   logged in, or a dedicated anonymous service user's token otherwise (Neon's
   Data API requires a valid JWT on every request, with no unauthenticated
   fallback).
3. Redirects unauthenticated requests away from `/account`.

`src/routes/(app)/+layout.ts`'s browser branch reads a readable mirror cookie
(`ID_TOKEN_CLIENT_COOKIE`, see `src/lib/constants/auth-cookies.ts`) to build a
client-side `NeonPostgrestClient` for direct browser→Data API calls (playlist
mutations, etc.) — that's why the delete-account / reset-password / etc. server
actions and the playlist-create button hit different failure modes when
something's wrong: they go through completely different request paths.

### Data Layer (`src/lib/neon/`)

Thin wrappers organized by domain, querying Neon's Data API:

- `videos.ts` — Video queries
- `playlists/` — Playlist queries, mutations, transforms, utils, duration
- `user-profiles.ts` — Profile queries
- `timestamps.ts` — Watch timestamp tracking
- `video-history.ts` — Watch history
- `notifications.ts` — Notification system
- `streams.ts` — Live stream status
- `images.ts` — Image format detection (WebP/AVIF)
- `database.types.ts` — Generated types (do not edit manually)

Most RPC functions take an explicit `p_user_id`/`userId` parameter now instead
of deriving it from `auth.user_id()` inside the SQL — see "Neon gotchas" below
for why.

### State Management (`src/lib/state/`)

Svelte 5 rune-based reactive state in `.svelte.ts` files. Each file exports a
singleton store: `content.svelte.ts`, `playlist.svelte.ts`,
`navigation.svelte.ts`, `sidebar.svelte.ts`, `page.svelte.ts`,
`source.svelte.ts`, `streaming.svelte.ts`, `user-preferences.svelte.ts`,
`media-query.svelte.ts`, `notifications.svelte.ts`.

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

Playlist thumbnails only, as of September 2026 — video thumbnails render
straight from `thumbnail_url` (YouTube's own JPEG); they used to go through the
same WebP/AVIF pipeline but it was removed (custom cropping/sizing is only
needed for playlists, and video thumbnails have a much higher volume, which was
burning through Trigger.dev's compute quota).

- `src/lib/server/image-processing.ts` — Server-side Sharp processing
- `src/trigger/image-processing-worker.ts` — Trigger.dev background job
  (crop/resize/encode a playlist thumbnail to WebP+AVIF, upload to S3).
  Triggered by `cdk/lib/lambda/process-images.ts`, an EventBridge-scheduled
  queue orchestrator that polls the `image_processing_jobs` table.
- `scripts/process-images-locally.ts` — drains that same queue in-process (no
  Trigger.dev) for when Trigger.dev compute is exhausted; run with
  `npx tsx scripts/process-images-locally.ts`
- `DISABLE_IMAGE_PROCESSING=true` env var disables processing in dev

### Testing Conventions

- Unit tests (`src/lib/**/*.test.ts`) and integration tests
  (`src/routes/**/*.test.ts`) both run via Vitest
- SvelteKit module aliases (`$app/*`, `$env/*`) are mocked in
  `src/lib/tests/__mocks__/`
- E2E tests live in `tests/e2e/` (see the `TestDataManager.ts` caveat above)

### Database

Postgres via Neon. Migration files that predate the Neon cutover are in
`neon/legacy-supabase-migrations/` (kept for history); adapted versions used to
set up Neon are in `neon/migrations/`. **That directory is not fully in sync
with the live schema** — several functions were patched directly against Neon
via its MCP tools during debugging and never backported to a migration file.
Diff against the live schema before trusting it.

## CDK Infrastructure (`cdk/`)

A separate AWS CDK project (TypeScript) with its own `package.json` and `.env`.
See `cdk/README.md` for the stack layout and deploy commands.

### CloudFront / Lambda gotchas (read before touching auth or web-stack.ts)

Two non-obvious AWS platform limitations shaped how `WebStack` is built — worth
knowing before "fixing" either of these back to something that looks more
standard:

1. **CloudFront OAC/SigV4 can't sign POST/PUT bodies for browser-originated
   requests.** AWS requires the _original client_ to precompute
   `x-amz-content-sha256`, which browsers never do. So the Lambda Function URL
   is public (`authType: NONE`), and access is gated instead by a secret
   `x-origin-verify` header CloudFront attaches, which `hooks.server.ts` checks
   on every request.
2. **AWS Lambda Function URLs reject query strings with no `=`** — e.g.
   `?/resetPassword`, which is exactly SvelteKit's named-form-action convention.
   Every named action (anything but a lone `default` action) was silently broken
   until a CloudFront Function (`FixNamedActionQueryString`) started
   percent-encoding the leading `/` at the edge.

### Neon gotchas

- `auth.user_id()` (Neon's RLS helper) can't be called from inside a SQL
  function body's `SECURITY INVOKER` context unless the calling role has `USAGE`
  on the `auth` schema — which customer roles can't grant themselves, and Neon
  won't grant either. Functions that need the current user's id take it as an
  explicit parameter instead.
- A schema-USAGE error doesn't always mean the same fix applies, though: check
  `pg_namespace.nspowner` first. `auth` is Neon-owned (can't fix via GRANT);
  `extensions` is owned by `bombify_owner` (a plain
  `GRANT USAGE ON SCHEMA extensions TO authenticated, anonymous` works fine).
- Node's `pg` driver doesn't know how to parse arrays of _custom_ Postgres types
  (enum arrays, etc.) — they round-trip as the raw `"{a,b,c}"` literal string
  unless a type parser is registered (see `src/lib/server/db.ts`).

### What CDK manages

- **AuthStack** — Cognito User Pool, Discord OIDC federation, a
  Pre-Token-Generation Lambda trigger (stamps a `role` claim Neon's Data API
  needs).
- **WebStack** — S3 (static assets) + CloudFront + the SSR Lambda.
- **AppStack / VideoStack** — Lambdas that sync YouTube videos/playlists into
  Neon. EventBridge schedules (production: every 30 min for videos, daily for
  playlists). `RepopulateStateMachine` (Step Functions) orchestrates a full
  repopulation of all sources.
- **CronStack** — Twitch stream polling, image processing, playlist/
  notification cleanup.

### CDK Commands

```bash
cd cdk
npm install
npx cdk deploy BombasticWebStack      # web app
npx cdk deploy BombasticAuthStack     # Cognito
npx cdk deploy "BombasticStack-Production/VideoStack"  # catalog sync (separate top-level stack, see below)
npx cdk diff <stack>                  # preview changes vs deployed state
npx cdk synth <stack>                 # emit CloudFormation template
```

`VideoStack` is instantiated inside `AppStack`'s constructor but extends `Stack`
(not `NestedStack`), so it's a fully separate CloudFormation stack —
`cdk deploy BombasticStack-Production` does **not** deploy it automatically.

Deploying `BombasticWebStack` requires building the Docker image first via
`cdk/scripts/prepare-web-lambda.sh`; see the root `README.md` for the buildx
workaround needed on machines where Docker Desktop produces an OCI-manifest-list
image Lambda rejects.

## Migration history

Moved off Vercel/Supabase in September 2026 after a multi-day Supabase outage.
Rough shape: Postgres → Neon, Auth → Cognito, Storage → S3, cron/edge functions
→ Lambda + EventBridge. Catalog fully repopulated from the YouTube API (13k+
videos). The old Supabase project has been deleted.
