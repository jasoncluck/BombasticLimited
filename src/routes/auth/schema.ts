import { z } from 'zod';

export const emailSchema = z.object({
  email: z.string().email().max(50).default(''),
});

export const usernameSchema = z.object({
  username: z.string().min(2).max(32).default(''),
});

export const passwordSchema = z.object({
  password: z.string().min(8).max(256).default(''),
});

// Schema for password confirmation (used in signup and password reset)
export const passwordConfirmationSchema = z.object({
  password: z.string().min(8).max(256).default(''),
  confirmPassword: z.string().min(8).max(256).default(''),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = emailSchema.merge(passwordSchema);

// Signup schema with password confirmation
export const signupSchema = emailSchema
  .merge(usernameSchema)
  .merge(z.object({
    password: z.string().min(8).max(256).default(''),
    confirmPassword: z.string().min(8).max(256).default(''),
  }))
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = emailSchema;

export type EmailSchema = typeof emailSchema;
export type UsernameSchema = typeof usernameSchema;
export type PasswordSchema = typeof passwordSchema;
export type PasswordConfirmationSchema = typeof passwordConfirmationSchema;

export type LoginSchema = typeof loginSchema;
export type SignupSchema = typeof signupSchema;
export type ForgotPasswordSchema = typeof forgotPasswordSchema;
