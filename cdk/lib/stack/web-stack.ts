import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

const CERTIFICATE_ARN =
  'arn:aws:acm:us-east-1:058264211686:certificate/4bd47339-9930-4d07-9ea2-b4dca29bcee4';

// Cognito User Pool created by BombasticAuthStack (see
// ~/.claude/plans/vectorized-riding-lake.md). Hardcoded here rather than
// cross-stack referenced, matching the CERTIFICATE_ARN convention above.
const COGNITO_USER_POOL_ID = 'us-east-1_HlOiTnRXC';
const COGNITO_USER_POOL_CLIENT_ID = '53ihi2vnq032licba8hmptvibt';
const COGNITO_HOSTED_UI_DOMAIN =
  'https://bombify-production-058264211686.auth.us-east-1.amazoncognito.com';

interface WebStackProps extends cdk.StackProps {
  stage: 'Production' | 'Staging';
  /** Public origin the SSR server should treat requests as coming from (CSRF check). */
  origin: string;
  neonDatabaseUrl: string;
  /** Dedicated Cognito user the server signs in as for anonymous/public Neon
   * Data API access (Neon requires a valid JWT on every request). */
  cognitoAnonUserEmail: string;
  cognitoAnonUserPassword: string;
  /** Shared secret CloudFront attaches to every origin request and the app
   * verifies — see the defaultBehavior origin comment below for why. */
  originVerifySecret: string;
  /** Bot token for the Discord app — Discord's OIDC claims don't expose a
   * real username/avatar, so the callback route calls Discord's REST API
   * directly instead (src/lib/server/discord.ts). */
  discordBotToken: string;
  /** Email that gets account_type='admin' at profile creation. */
  adminEmail: string;
}

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const {
      stage,
      origin,
      neonDatabaseUrl,
      cognitoAnonUserEmail,
      cognitoAnonUserPassword,
      originVerifySecret,
      discordBotToken,
      adminEmail,
    } = props;

    const stagedAppDir = path.join(__dirname, '../web-lambda/dist');

    const ssrFunction = new lambda.DockerImageFunction(this, 'SsrFunction', {
      functionName: `BombasticWeb-${stage}`,
      description: `SvelteKit SSR server via Lambda Web Adapter (${stage})`,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      code: lambda.DockerImageCode.fromImageAsset(stagedAppDir, {
        file: 'Dockerfile',
        platform: ecrAssets.Platform.LINUX_ARM64,
      }),
      environment: {
        NODE_ENV: 'production',
        ORIGIN: origin,
        BODY_SIZE_LIMIT: '10M',
        NEON_DATABASE_URL: neonDatabaseUrl,
        COGNITO_USER_POOL_ID,
        COGNITO_USER_POOL_CLIENT_ID,
        COGNITO_HOSTED_UI_DOMAIN,
        COGNITO_REGION: 'us-east-1',
        COGNITO_ANON_USER_EMAIL: cognitoAnonUserEmail,
        COGNITO_ANON_USER_PASSWORD: cognitoAnonUserPassword,
        ORIGIN_VERIFY_SECRET: originVerifySecret,
        DISCORD_BOT_TOKEN: discordBotToken,
        ADMIN_EMAIL: adminEmail,
      },
    });

    // Only the Admin* Cognito APIs require IAM credentials (account
    // deletion, Discord-account-linking) — the rest (SignUp, InitiateAuth,
    // ForgotPassword, etc.) are called with just the App Client ID.
    ssrFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminDeleteUser',
          'cognito-idp:AdminLinkProviderForUser',
          'cognito-idp:AdminGetUser',
        ],
        resources: [
          `arn:aws:cognito-idp:us-east-1:${this.account}:userpool/${COGNITO_USER_POOL_ID}`,
        ],
      })
    );

    // CloudFront OAC/SigV4 can't sign POST/PUT bodies for browser-originated
    // requests (AWS requires the *original client* to precompute
    // x-amz-content-sha256, which browsers never do — confirmed against
    // AWS's own OAC-for-Lambda docs and multiple community reports of the
    // same InvalidSignatureException). So the Function URL is public, and
    // access is instead restricted by the secret header below, which
    // hooks.server.ts verifies on every request.
    const ssrFunctionUrl = ssrFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // As of Oct 2025, Function URLs also require a separate
    // lambda:InvokeFunction grant alongside lambda:InvokeFunctionUrl (which
    // addFunctionUrl above already adds) — CDK doesn't add this one
    // automatically. CloudFormation's AWS::Lambda::Permission has no way to
    // scope this to "only via the Function URL" (the InvokedViaFunctionUrl
    // condition key isn't exposed), so this is intentionally broad; the app's
    // own x-origin-verify secret check (hooks.server.ts) is the real gate.
    ssrFunction.addPermission('InvokeFunctionForFunctionUrl', {
      principal: new iam.AnyPrincipal(),
      action: 'lambda:InvokeFunction',
    });

    const staticAssetsBucket = new s3.Bucket(this, 'StaticAssets', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Replaces the Supabase Storage `content-images` bucket. Public-read,
    // same as the original bucket (thumbnails are shown via plain URLs).
    // Explicit (not auto-generated) name: the client bundle needs a stable
    // URL to build public image URLs from at build time.
    const contentImagesBucket = new s3.Bucket(this, 'ContentImages', {
      bucketName: `bombify-content-images-${stage.toLowerCase()}`,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Replaces the Supabase Storage `bug-report-images` bucket. Private —
    // the app hands out presigned PUT/GET URLs per upload.
    const bugReportImagesBucket = new s3.Bucket(this, 'BugReportImages', {
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    contentImagesBucket.grantReadWrite(ssrFunction);
    bugReportImagesBucket.grantReadWrite(ssrFunction);
    ssrFunction.addEnvironment(
      'CONTENT_IMAGES_BUCKET',
      contentImagesBucket.bucketName
    );
    ssrFunction.addEnvironment(
      'BUG_REPORT_IMAGES_BUCKET',
      bugReportImagesBucket.bucketName
    );

    new s3deploy.BucketDeployment(this, 'DeployStaticAssets', {
      sources: [
        s3deploy.Source.asset(
          path.join(__dirname, '../../../build/client/_app')
        ),
      ],
      destinationBucket: staticAssetsBucket,
      destinationKeyPrefix: '_app',
      cacheControl: [
        s3deploy.CacheControl.fromString(
          'public, max-age=31536000, immutable'
        ),
      ],
      prune: true,
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      CERTIFICATE_ARN
    );

    // Lambda Function URLs reject query strings that don't look like
    // key=value pairs (AWS returns InvalidQueryStringException) — but
    // SvelteKit's named-form-action convention is exactly that: a bare
    // "?/actionName" with no "=". Every such request (delete account, reset
    // password, update username/email, unlink Discord, etc.) was failing
    // before ever reaching the Lambda. Fix: percent-encode a leading "/" in
    // any query string key at the edge; Node's own URL parsing decodes it
    // back to "/" when SvelteKit reads url.searchParams, so the app never
    // sees a difference. Confirmed via curl directly against both the
    // Function URL and CloudFront that this exact transform is what's
    // needed (2026-09-18).
    const fixNamedActionQueryStringFn = new cloudfront.Function(
      this,
      'FixNamedActionQueryString',
      {
        comment: 'Percent-encode leading / in query string keys for Lambda Function URL compatibility',
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    var qs = request.querystring;
    var keys = Object.keys(qs);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.charAt(0) === '/') {
            qs['%2F' + key.substring(1)] = qs[key];
            delete qs[key];
        }
    }
    return request;
}
`),
      }
    );

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Bombastic web (${stage})`,
      domainNames: ['bombastic.ltd', 'www.bombastic.ltd'],
      certificate,
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(ssrFunctionUrl, {
          customHeaders: { 'x-origin-verify': originVerifySecret },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [
          {
            function: fixNamedActionQueryStringFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/_app/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(
            staticAssetsBucket
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'Point bombastic.ltd (CNAME/ALIAS) at this once verified',
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: ssrFunctionUrl.url,
      description:
        'Direct Lambda Function URL (publicly invocable, but the app rejects requests without the x-origin-verify header CloudFront attaches)',
    });

    new cdk.CfnOutput(this, 'ContentImagesBucketName', {
      value: contentImagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'BugReportImagesBucketName', {
      value: bugReportImagesBucket.bucketName,
    });
  }
}
