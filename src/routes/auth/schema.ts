import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().email().max(50).default(""),
});

export const usernameSchema = z.object({
  username: z.string().min(2).max(32).default(""),
});

export const passwordSchema = emailSchema.extend({
  password: z.string().min(8).max(256).default(""),
});

export const loginSchema = emailSchema.merge(passwordSchema);
export const signupSchema = emailSchema
  .merge(usernameSchema)
  .merge(passwordSchema);

export type EmailSchema = typeof emailSchema;
export type UsernameSchema = typeof usernameSchema;
export type PasswordSchema = typeof passwordSchema;

export type LoginSchema = typeof loginSchema;
export type SignupSchema = typeof signupSchema;
