# Bombastic Limited

A SvelteKit app that aggregates and organizes video content from a set of
YouTube channels (Giant Bomb, Jeff Gerstmann, Nextlander, Remap), with user
accounts, playlists, watch progress, and live-stream notifications.

## Stack

- **App**: SvelteKit 2 / Svelte 5, TypeScript, Tailwind CSS
- **Database**: [Neon](https://neon.tech) (serverless Postgres), queried via
  Neon's Data API (`@neondatabase/postgrest-js`, a PostgREST-compatible client)
  from the browser, and directly via `pg` from server-only code that needs to
  bypass RLS (account deletion, profile creation, admin operations)
- **Auth**: AWS Cognito, with Discord federated as a generic OIDC identity
  provider. Discord's OIDC integration doesn't expose a real username or avatar,
  so `src/lib/server/discord.ts` calls Discord's REST API directly with a bot
  token to fetch those.
- **Storage**: S3 (content thumbnails, bug report uploads)
- **Hosting**: SvelteKit's Node adapter running in a Lambda container image (via
  [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)),
  fronted by CloudFront + a CloudFront Function (see
  `cdk/lib/stack/web-stack.ts` for why — Lambda Function URLs don't tolerate
  SvelteKit's `?/actionName` form-action query strings without help)
- **Background jobs**: AWS Lambda + EventBridge (YouTube catalog sync, Twitch
  stream polling, image processing, notification/playlist cleanup) — see `cdk/`
- **Infra as code**: AWS CDK (TypeScript), in `cdk/`

## Local development

```bash
npm install
npm run dev
```

You'll need a `.env` file (gitignored, not included) with at minimum:

- `NEON_DATABASE_URL` / `PUBLIC_NEON_DATA_API_URL` — a Neon project's connection
  string and Data API URL
- `COGNITO_USER_POOL_ID` / `COGNITO_USER_POOL_CLIENT_ID` / `COGNITO_REGION` /
  `COGNITO_HOSTED_UI_DOMAIN` — from a deployed `BombasticAuthStack`
- `COGNITO_ANON_USER_EMAIL` / `COGNITO_ANON_USER_PASSWORD` — a Cognito user the
  server signs in as for anonymous/public Neon Data API reads
- `PUBLIC_CONTENT_IMAGES_URL` — the S3 bucket's public URL for content images
- `GOOGLE_API_KEY` — for the YouTube Data API (catalog sync scripts)

See `cdk/bin/cdk.ts` and `cdk/lib/stack/*.ts` for the full set of variables each
piece of infrastructure needs.

## Useful scripts

- `npm run check` — typecheck (svelte-check)
- `npm run test:unit` / `npm run test:integration` — Vitest
- `npm run test:e2e` — Playwright
- `npm run lint` / `npm run format` — Prettier + ESLint

## Deploying

Infrastructure lives in `cdk/` as a separate npm package (its own
`package.json`, own `.env`). See `cdk/README.md` for the stack layout and deploy
commands.

The web app itself deploys as a Docker image (SvelteKit's Node build + Lambda
Web Adapter): `cdk/scripts/prepare-web-lambda.sh` builds it, then
`cdk deploy BombasticWebStack` ships it. On machines where Docker Desktop's
containerd image store produces an OCI manifest-list image that Lambda rejects,
rebuild manually first:

```bash
docker buildx build --platform linux/arm64 --output type=docker \
  --provenance=false --sbom=false \
  -t <the ECR URI cdk deploy reports> \
  -f cdk/lib/web-lambda/dist/Dockerfile cdk/lib/web-lambda/dist
docker push <that URI>
```

then re-run `cdk deploy`.
