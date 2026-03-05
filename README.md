# Bombastic

A web application for browsing, organizing, and tracking video content from
gaming media creators: Giant Bomb, Jeff Gerstmann, Nextlander, and Remap.

Built with SvelteKit, Supabase, and deployed to Vercel.

Deployed to https://bombastic.ltd.

## Prerequisites

- Node.js 20+
- Docker (required by Supabase local dev) —
  [Install Docker](https://docs.docker.com/get-docker/)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
  — `npm install -g supabase` or via Homebrew:
  `brew install supabase/tap/supabase`

## Getting Started

**1. Install dependencies**

```bash
npm install
```

**2. Set up environment variables**

```bash
cp .env.example .env.local
```

Fill in the values as described in the
[Environment Variables](#environment-variables) section below.

**3. Start local Supabase**

Docker must be running.

```bash
supabase start
```

This starts the local Supabase stack and prints your local keys. Copy the
`anon key`, `service_role key`, and `JWT secret` values into `.env.local`.

**4. Apply migrations and generate types**

```bash
supabase db reset       # Applies all migrations and seeds the database
npm run generate-types  # Generates src/lib/supabase/database.types.ts
```

**5. Start the dev server**

```bash
npm run dev
```

The app will be available at `http://localhost:5173`. Supabase Studio runs at
`http://localhost:54323`.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in each value. The sections below
explain where to get each one.

### Supabase (local)

After running `npm run test:setup` (or `supabase start`), the CLI prints all
local keys:

| Variable                    | Value                                               |
| --------------------------- | --------------------------------------------------- |
| `PUBLIC_SUPABASE_URL`       | `http://127.0.0.1:54321`                            |
| `PUBLIC_SUPABASE_ANON_KEY`  | Printed by `supabase start` as **anon key**         |
| `SUPABASE_SERVICE_ROLE_KEY` | Printed by `supabase start` as **service_role key** |

You can also retrieve them at any time with `supabase status`.

### Discord OAuth

Discord login is an optional auth provider. To enable it locally:

1. Go to
   [discord.com/developers/applications](https://discord.com/developers/applications)
   and create a new application.
2. Under **OAuth2**, add a redirect URI:
   `http://127.0.0.1:54321/auth/v1/callback`
3. Copy the **Client ID** and **Client Secret** into `.env.local`.

| Variable                                       | Value                                     |
| ---------------------------------------------- | ----------------------------------------- |
| `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID`     | From Discord application                  |
| `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_SECRET` | From Discord application                  |
| `SUPABASE_AUTH_EXTERNAL_REDIRECT_URL`          | `http://127.0.0.1:54321/auth/v1/callback` |

These variables are read by `supabase/config.toml` and must be present when
running `supabase start`.

### Twitch

Twitch credentials are used to poll live stream status via the
`poll-twitch-streams` edge function.

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and
   create a new application.
2. Set the **OAuth Redirect URL** to your ngrok URL (see below) for local
   webhook testing.
3. Copy the **Client ID** and generate a **Client Secret**.

| Variable               | Value                   |
| ---------------------- | ----------------------- |
| `TWITCH_CLIENT_ID`     | From Twitch application |
| `TWITCH_CLIENT_SECRET` | From Twitch application |

### ngrok (Twitch webhook testing)

Twitch EventSub webhooks require a publicly reachable HTTPS URL. ngrok creates a
secure tunnel from the internet to your local server.

1. Create an account at [ngrok.com](https://ngrok.com) and copy your auth token
   from
   [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
2. Set `NGROK_AUTH_TOKEN` in `.env.local`.
3. Start a tunnel to your local app:
   ```bash
   ngrok http 5173
   ```
4. Use the resulting `https://*.ngrok-free.app` URL as the OAuth redirect URL in
   your Twitch application and when registering webhooks:
   ```bash
   npm run twitch:webhook:setup   # Register EventSub webhooks
   npm run twitch:webhook:list    # List active subscriptions
   npm run twitch:webhook:cleanup # Remove all subscriptions
   ```

> Discord OAuth and Twitch are optional for basic local development. The app
> runs without them; only the auth provider and live stream indicator features
> will be unavailable.

## Commands

```bash
npm run dev              # Start dev server
npm run build            # Format + type check + Vite build
npm run check            # Svelte type check
npm run format           # Prettier format all files
npm run lint             # Prettier check + ESLint

npm run generate-types   # Regenerate Supabase TypeScript types (after DB changes)

supabase start           # Start local Supabase stack
supabase stop            # Stop local Supabase stack
supabase db reset        # Re-apply all migrations and seed data
supabase status          # Print local API keys and URLs
```

## Testing

```bash
npm run test             # Unit + integration tests (watch)
npm run test:ci          # Run once with coverage
npm run test:unit        # src/lib/ tests only
npm run test:integration # src/routes/ tests only
npx vitest run src/path/to/file.test.ts  # Single file

npm run test:e2e         # Playwright E2E tests
npm run test:e2e:headed  # E2E with browser visible
npm run test:sql         # SQL tests via Supabase
```

## Project Structure

```
src/
  hooks.server.ts          # Supabase client + auth guard
  routes/
    (app)/                 # Main application routes
      +layout.server.ts    # Session, user profile, content filter
      +layout.ts           # Browser Supabase client setup
      [source]/            # Per-creator feeds
      video/[id]/          # Video player
      playlist/[shortId]/  # Playlist view
      continue/            # Continue watching
      search/[query]/      # Search
      auth/                # Login, signup, password flows
      account/             # Account settings
      api/                 # Internal API endpoints
    (docs)/                # Documentation pages (MDsveX)
  lib/
    supabase/              # Database query functions + generated types
    components/            # UI components
    state/                 # Svelte 5 rune-based global state (.svelte.ts)
    constants/             # Sources, routes, layout constants
    server/                # Server-only utilities (image processing)
    utils/                 # Shared utilities
  trigger/                 # Trigger.dev background jobs
supabase/
  migrations/              # Database migrations
  tests/                   # SQL tests
```

## Infrastructure

AWS Lambda functions for syncing YouTube content into the database are managed
separately in the [`cdk/`](./cdk/README.md) directory.
