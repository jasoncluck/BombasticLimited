# Bombastic Limited — Infrastructure (AWS CDK)

A separate npm package from the main SvelteKit app — install and run everything
in this directory from `cdk/`, not the repo root.

```bash
cd cdk
npm install
```

You'll need a `cdk/.env` (gitignored) with production values for the variables
each stack validates in `bin/cdk.ts` — see that file for the exact list per
stack.

## Stacks

- **`BombasticAuthStack`** — Cognito User Pool, Discord federated as a generic
  OIDC identity provider, a Pre-Token-Generation Lambda trigger that stamps a
  `role` claim onto every issued ID token (Neon's Data API needs it — see the
  root `CLAUDE.md` for why).
- **`BombasticWebStack`** — S3 (static `_app` assets) + CloudFront + the SSR
  Lambda (SvelteKit's Node build in a container image, via
  [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)).
  Includes a CloudFront Function that works around an AWS Lambda Function URL
  limitation with SvelteKit's form-action query strings — see the root
  `CLAUDE.md`'s "CloudFront / Lambda gotchas" section before changing anything
  here.
- **`BombasticStack-Production`** → **`VideoStack`** — Lambdas that sync YouTube
  videos/playlists into Neon on EventBridge schedules, plus a Step Functions
  state machine (`RepopulateStateMachine`) for full repopulation. `VideoStack`
  is a separate top-level CloudFormation stack (see "Deploying" below for why
  that matters).
- **`BombasticCronStack`** — Twitch stream polling, image processing,
  playlist/notification cleanup.
- **`BackupStack`** — database backup infrastructure. Still references the
  now-deleted Supabase project and isn't wired up to Neon; currently disabled
  (commented out in `lib/stack/app-stack.ts`). See `BACKUP_README.md`.

## Deploying

```bash
npx cdk diff <stack-name>       # preview changes
npx cdk deploy <stack-name>     # deploy one stack
```

`VideoStack` is instantiated inside `AppStack`'s constructor but extends `Stack`
(not `NestedStack`), so it's a genuinely separate CloudFormation stack —
deploying `BombasticStack-Production` does **not** deploy it. Deploy it
explicitly:

```bash
npx cdk deploy "BombasticStack-Production/VideoStack"
```

### Deploying the web app

`BombasticWebStack` needs a built Docker image staged first:

```bash
./scripts/prepare-web-lambda.sh
npx cdk deploy BombasticWebStack
```

On machines where Docker Desktop's containerd image store produces an OCI
manifest-list image (Lambda rejects these with "image manifest ... not
supported"), `cdk deploy` will fail after building. Rebuild manually and push
before retrying:

```bash
docker buildx build --platform linux/arm64 --output type=docker \
  --provenance=false --sbom=false \
  -t <the ECR URI from the failed deploy's error message> \
  -f lib/web-lambda/dist/Dockerfile lib/web-lambda/dist
# if ECR complains the tag already exists (immutable tags):
aws ecr batch-delete-image --repository-name cdk-hnb659fds-container-assets-<account>-<region> --image-ids imageTag=<tag>
docker push <that URI>
npx cdk deploy BombasticWebStack
```

## Tests

```bash
npm test
```
