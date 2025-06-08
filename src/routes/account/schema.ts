import { z } from "zod";

export const accountSchema = z.object({
  email: z.string().email().max(50).default('foobar'),
  username: z.string().max(25).nullable().default('baz'),
});

export type AccountSchema = typeof accountSchema;
