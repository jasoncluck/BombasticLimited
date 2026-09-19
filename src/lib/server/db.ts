import { Pool, types } from 'pg';

/**
 * Direct Neon connection for server-side code that needs to bypass the
 * Data API/RLS (e.g. account deletion, profile creation at signup) —
 * connects as the database owner, same as the cron Lambdas.
 */
export const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

// node-postgres only parses arrays of built-in types out of the box — arrays
// of custom enum types (e.g. profiles.sources, a source[]) get a
// dynamically-assigned OID it doesn't recognize, so they round-trip as the
// raw "{a,b,c}" literal string instead of a JS array. Without this, anything
// reading profiles.sources (e.g. the home page's source list) silently gets
// a string instead of an array. Top-level await so every pool.query() call
// elsewhere is guaranteed to run after this resolves.
const { rows: enumArrayTypes } = await pool.query<{
  typname: string;
  oid: number;
}>(
  `SELECT t.typname, t.oid
   FROM pg_type t
   JOIN pg_type et ON et.oid = t.typelem
   WHERE t.typcategory = 'A' AND et.typtype = 'e'`
);
for (const { oid } of enumArrayTypes) {
  types.setTypeParser(oid, (value) =>
    value === '{}' ? [] : value.slice(1, -1).split(',')
  );
}
