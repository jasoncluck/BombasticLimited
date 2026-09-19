import type { PreTokenGenerationTriggerHandler } from 'aws-lambda';

/**
 * Stamps every issued ID token with a `role: authenticated` claim.
 *
 * Neon's Data API resolves the Postgres role from the JWT's `role` claim
 * (configured as `jwt_role_claim_key: ".role"`); tokens without that claim
 * resolve to `db_anon_role` ("anonymous", which has no table grants) rather
 * than falling back to `authenticated` as the general docs imply — that
 * fallback only happens for Neon's own Managed Better Auth tokens, which
 * always include the claim themselves. Plain Cognito ID tokens never carry
 * a `role` claim on their own, so every user (including the dedicated
 * anonymous service user — RLS/GRANTs already scope it to public data)
 * needs this trigger to resolve to `authenticated`.
 */
export const handler: PreTokenGenerationTriggerHandler = async (event) => {
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        role: 'authenticated',
      },
    },
  };
  return event;
};
