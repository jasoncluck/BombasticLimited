interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface CognitoIdentity {
  providerName: string;
  userId: string;
}

/**
 * Cognito's Discord OIDC integration only ever exposes email/sub — Discord's
 * userinfo endpoint doesn't return a username or avatar claim (confirmed
 * empirically: AdminGetUser never populates preferred_username/picture for
 * Discord logins, on two separate fresh signups). Call Discord's own REST
 * API directly instead, using the snowflake ID Cognito already captured in
 * the ID token's `identities` claim (aws-jwt-verify parses this into an
 * array for us — it is not a raw JSON string).
 */
export async function fetchDiscordProfile(
  identities: CognitoIdentity[] | undefined
): Promise<{ username: string; avatarUrl: string | null } | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken || !identities) return null;

  const discordId = identities.find(
    (i) => i.providerName === 'Discord'
  )?.userId;
  if (!discordId) return null;

  const res = await fetch(`https://discord.com/api/users/${discordId}`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) return null;

  const user = (await res.json()) as DiscordUser;
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${
        user.avatar.startsWith('a_') ? 'gif' : 'png'
      }`
    : null;

  return { username: user.username, avatarUrl };
}
