import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

interface AuthStackProps extends cdk.StackProps {
  stage: 'Production' | 'Staging';
  discordClientId: string;
  discordClientSecret: string;
  callbackUrls: string[];
  logoutUrls: string[];
}

/**
 * Cognito replaces Supabase Auth. Discord is federated as a generic OIDC
 * identity provider — Discord exposes a standards-compliant discovery
 * document at https://discord.com/.well-known/openid-configuration
 * (confirmed 2026-09-16), so no custom auth-challenge shim is needed.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stage, discordClientId, discordClientSecret, callbackUrls, logoutUrls } =
      props;

    // Stamps `role: authenticated` onto every issued ID token — see the
    // comment in pre-token-generation.ts for why this is required.
    const preTokenGenerationFn = new nodejs.NodejsFunction(
      this,
      'PreTokenGenerationFunction',
      {
        functionName: `BombasticPreTokenGeneration-${stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, '../lambda/pre-token-generation.ts'),
        handler: 'handler',
      }
    );

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `Bombify-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lambdaTriggers: {
        preTokenGeneration: preTokenGenerationFn,
      },
    });

    const discordProvider = new cognito.UserPoolIdentityProviderOidc(
      this,
      'DiscordProvider',
      {
        userPool: this.userPool,
        name: 'Discord',
        clientId: discordClientId,
        clientSecret: discordClientSecret,
        issuerUrl: 'https://discord.com',
        scopes: ['openid', 'email', 'identify'],
        attributeMapping: {
          email: cognito.ProviderAttribute.other('email'),
          preferredUsername: cognito.ProviderAttribute.other('username'),
        },
      }
    );

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: false,
      // userPassword (USER_PASSWORD_AUTH): our own server calls Cognito's
      // InitiateAuth directly for the app's custom login form, rather than
      // implementing SRP client-side or using Hosted UI for password auth.
      authFlows: { userSrp: true, userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.custom('Discord'),
      ],
    });
    this.userPoolClient.node.addDependency(discordProvider);

    const domainPrefix = `bombify-${stage.toLowerCase()}-${this.account}`;
    const domain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: { domainPrefix },
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'HostedUiDomain', { value: domain.baseUrl() });
    new cdk.CfnOutput(this, 'JwksUrl', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}/.well-known/jwks.json`,
      description:
        'Configure this as the custom JWT provider JWKS URL in Neon Data API',
    });
  }
}
