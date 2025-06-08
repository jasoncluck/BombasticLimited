import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(50).default(''),
  password: z.string().min(8).max(256).default(''),
});

export const signupSchema = loginSchema.extend({
  username: z.string().min(2).max(254).default(''),
});

export type LoginSchema = typeof loginSchema;
export type SignupSchema = typeof signupSchema;
