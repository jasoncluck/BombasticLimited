import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminDeleteUserCommand,
  AdminLinkProviderForUserCommand,
  UpdateUserAttributesCommand,
  VerifyUserAttributeCommand,
  type InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const REGION = process.env.COGNITO_REGION!;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_USER_POOL_CLIENT_ID!;
export const HOSTED_UI_DOMAIN = process.env.COGNITO_HOSTED_UI_DOMAIN!;

const client = new CognitoIdentityProviderClient({ region: REGION });

const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  clientId: CLIENT_ID,
  tokenUse: 'id',
});

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

function tokensFromResult(
  result: InitiateAuthCommandOutput['AuthenticationResult']
): CognitoTokens {
  if (!result?.IdToken || !result.AccessToken) {
    throw new Error('Cognito did not return tokens');
  }
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn ?? 3600,
  };
}

/** Verifies a Cognito ID token JWT. Returns null if invalid/expired. */
export async function verifyIdToken(token: string) {
  try {
    return await idTokenVerifier.verify(token);
  } catch {
    return null;
  }
}

export async function signUp({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ userSub?: string; error?: { code: string; message: string } }> {
  try {
    const result = await client.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }],
      })
    );
    return { userSub: result.UserSub };
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function confirmSignUp({
  email,
  code,
}: {
  email: string;
  code: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function resendConfirmationCode({
  email,
}: {
  email: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new ResendConfirmationCodeCommand({ ClientId: CLIENT_ID, Username: email })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ tokens?: CognitoTokens; error?: { code: string; message: string } }> {
  try {
    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    );
    return { tokens: tokensFromResult(result.AuthenticationResult) };
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

let cachedAnonToken: { token: string; expiresAt: number } | null = null;
let anonTokenRequest: Promise<string | null> | null = null;

/**
 * Returns a Cognito ID token for the dedicated "anonymous" service user,
 * cached in memory across warm Lambda invocations. Neon's Data API requires
 * a valid JWT on every request, even for public/unauthenticated reads (no
 * "omit the header" fallback like Supabase's anon key) — this token is what
 * the server sends as the Bearer token whenever there's no real signed-in
 * visitor.
 */
export async function getAnonymousToken(): Promise<string | null> {
  const REFRESH_BUFFER_MS = 60_000;
  if (cachedAnonToken && cachedAnonToken.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return cachedAnonToken.token;
  }

  if (!anonTokenRequest) {
    anonTokenRequest = (async () => {
      const email = process.env.COGNITO_ANON_USER_EMAIL;
      const password = process.env.COGNITO_ANON_USER_PASSWORD;
      if (!email || !password) return null;

      const { tokens, error } = await signInWithPassword({ email, password });
      if (error || !tokens) {
        console.error('Failed to sign in as anonymous service user:', error);
        return null;
      }

      cachedAnonToken = {
        token: tokens.idToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
      };
      return cachedAnonToken.token;
    })().finally(() => {
      anonTokenRequest = null;
    });
  }

  return anonTokenRequest;
}

export async function refreshTokens({
  refreshToken,
}: {
  refreshToken: string;
}): Promise<{ tokens?: CognitoTokens; error?: { code: string; message: string } }> {
  try {
    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      })
    );
    return { tokens: tokensFromResult(result.AuthenticationResult) };
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function forgotPassword({
  email,
}: {
  email: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new ForgotPasswordCommand({ ClientId: CLIENT_ID, Username: email })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function confirmForgotPassword({
  email,
  code,
  newPassword,
}: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

/** Starts an email change — Cognito emails a verification code to the new address. */
export async function updateEmailAttribute({
  accessToken,
  newEmail,
}: {
  accessToken: string;
  newEmail: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new UpdateUserAttributesCommand({
        AccessToken: accessToken,
        UserAttributes: [{ Name: 'email', Value: newEmail }],
      })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function verifyEmailAttribute({
  accessToken,
  code,
}: {
  accessToken: string;
  code: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new VerifyUserAttributeCommand({
        AccessToken: accessToken,
        AttributeName: 'email',
        Code: code,
      })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

export async function adminDeleteUser({
  userId,
}: {
  userId: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

/** Links a federated Discord identity to an existing native (email/password) user. */
export async function adminLinkDiscordIdentity({
  destinationEmail,
  discordUserSub,
}: {
  destinationEmail: string;
  discordUserSub: string;
}): Promise<{ error?: { code: string; message: string } }> {
  try {
    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: USER_POOL_ID,
        DestinationUser: {
          ProviderName: 'Cognito',
          ProviderAttributeValue: destinationEmail,
        },
        SourceUser: {
          ProviderName: 'Discord',
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: discordUserSub,
        },
      })
    );
    return {};
  } catch (err) {
    return { error: toAuthError(err) };
  }
}

/** Redirect URL to start the Cognito-brokered Discord OAuth flow (sign-in or link). */
export function getDiscordAuthorizeUrl({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    identity_provider: 'Discord',
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
    state,
  });
  return `${HOSTED_UI_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

/** Exchanges a Cognito OAuth authorization code (from the Discord flow) for tokens. */
export async function exchangeCodeForTokens({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<{ tokens?: CognitoTokens; error?: string }> {
  const response = await fetch(`${HOSTED_UI_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { error: `Failed to exchange authorization code: ${body}` };
  }

  const data = await response.json();
  return {
    tokens: {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
    },
  };
}

/**
 * Cognito errors come back with a `name` matching the AWS exception type
 * (e.g. "UserNotConfirmedException"). We map the handful the app branches
 * on to short codes mirroring the old Supabase error `code` field.
 */
function toAuthError(err: unknown): { code: string; message: string } {
  const name = err instanceof Error ? err.name : 'UnknownError';
  const message = err instanceof Error ? err.message : 'Unknown error occurred';

  switch (name) {
    case 'UserNotConfirmedException':
      return { code: 'email_not_confirmed', message };
    case 'UsernameExistsException':
      return { code: 'user_already_exists', message };
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return { code: 'invalid_code', message };
    case 'NotAuthorizedException':
      return { code: 'invalid_credentials', message };
    default:
      return { code: name, message };
  }
}
