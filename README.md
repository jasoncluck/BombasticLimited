# sv

Everything you need to build a Svelte project, powered by
[`sv`](https://github.com/sveltejs/cli).

## API Key Set up

### Application

The following variables are needed to setup a working developer environment. To
get these you will need:

- A [Supabase]("https://supabase.com/") account with a separate project created
  for this application. This will provide the public URL and anon key.
- A Twitch developer account which can be created on <https://dev.twitch.tv/>.
- An [ngrok](https://ngrok.com/) account for testing Twitch webhooks locally
  without setting up local HTTPS certs.

```env
PUBLIC_SUPABASE_URL="<YOUR_SUPABASE_URL"
PUBLIC_SUPABASE_ANON_KEY="<YOUR_SUPABASE_ANON_KEY"
TWITCH_CLIENT_ID="<YOUR_TWITCH_CLIENT_ID"
TWITCH_CLIENT_SECRET="<YOUR_TWITCH_CLIENT_SECRET>"
NGROK_AUTH_TOKEN="<YOUR_NGROK_AUTH_TOKEN>"


```

### Compute Infrastructure

AWS is used (with CDK) to populate the Supabase tables with the video
information from YouTube. This functionality is split out into a separate npm
package under the cdk/ folder. This is not currently set up as a monorepo and
requires a separate set of env vars. In addition to the below keys an AWS
account is needed and the CLI tools for
[AWS]("https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html")
and [CDK]("https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html"). I'd
suggest creating an AWS IAM Identity Center instance in your account then
creating a user with appropriate permissions. This simplifies the credential
refresh process with the AWS CLI to be: `aws sso login`.

NOTE: This should be fixed before going live.

```
GOOGLE_API_KEY="<YOUR_GOOGLE_API_KEY"

SUPABASE_URL="<YOUR_SUPABASE_API_URL>"
SUPABASE_SERVICE_API_KEY="<YOUR_PRIVATE_SUPABASE_KEY>"

```

##

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or
`pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Testing

### Unit and Component Tests
```bash
npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run with coverage report
```

### End-to-End Tests
```bash
npm run test:e2e      # Run Playwright e2e tests
npm run test:e2e:ui   # Run with UI
```

### SQL Database Tests
```bash
npm run test:sql               # Run all SQL tests
npm run test:sql:syntax        # Syntax validation only
npm run test:sql:migration     # Migration tests
npm run test:sql:functional    # Functional tests
npm run test:sql:integration   # Integration tests
npm run test:sql:runner        # Run with custom script
```

For detailed SQL testing documentation, see [docs/SQL_TESTING.md](docs/SQL_TESTING.md).

**Note:** SQL tests require a running Supabase instance. Start with `supabase start` before running database-dependent tests.

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an
> [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Testing

This project includes comprehensive testing with both unit tests and end-to-end
tests.

### Unit Tests

Run unit tests with Vitest:

```bash
npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run tests with coverage report
npm run test:ui       # Run tests with UI
```

### End-to-End Tests

Run E2E tests with Playwright (includes mobile browser support):

```bash
npm run test:e2e           # Run all E2E tests
npm run test:e2e:mobile    # Run mobile-only tests
npm run test:e2e:desktop   # Run desktop-only tests
npm run test:e2e:ui        # Run tests with interactive UI
npm run test:e2e:debug     # Run tests in debug mode
npm run test:e2e:report    # View test reports
```

#### First-time Setup

Install Playwright browsers:

```bash
npx playwright install
```

#### Test Coverage

E2E tests cover:

- **Cross-browser compatibility** (Chrome, Firefox, Safari)
- **Mobile device emulation** (iPhone, Android devices)
- **Responsive design testing**
- **Touch interactions** (tap, swipe, pinch zoom)
- **User interaction flows**
- **Accessibility features**

For detailed testing documentation, see
[tests/e2e/README.md](tests/e2e/README.md).

### Run All Tests

```bash
npm run test:all  # Run both unit and E2E tests
```
