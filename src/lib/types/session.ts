/**
 * Replaces `@supabase/supabase-js`'s `Session` type for client-side code.
 * Deliberately kept `.user.id`-shaped so the ~40 components that just
 * thread a session through as a prop (checking truthiness or reading
 * `.user.id`) don't need individual changes — only the files that called
 * `.auth.*` methods directly were rewritten for Cognito.
 */
export interface AppSession {
  user: {
    id: string;
    /** Not set by production code (email lives in `locals.userEmail`
     * instead) — kept optional here only so test mocks can populate it. */
    email?: string;
  };
}
