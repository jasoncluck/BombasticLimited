import { z } from 'zod';

export const emailSchema = z.object({
  email: z.string().email().max(50),
});

export const usernameSchema = z.object({
  username: z.string().min(2).max(32),
});

export const passwordSchema = z.object({
  password: z.string().min(8).max(256),
});

// Schema for password confirmation (used in signup and password reset)
export const passwordConfirmationSchema = z
  .object({
    password: z.string().min(8).max(256),
    confirmPassword: z.string().min(8).max(256),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const loginSchema = emailSchema.merge(passwordSchema);

// Signup schema with password confirmation
export const signupSchema = emailSchema
  .merge(usernameSchema)
  .merge(
    z.object({
      password: z.string().min(8).max(256),
      confirmPassword: z.string().min(8).max(256),
    })
  )
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = emailSchema;

// Updated type exports for better v4 compatibility
export type EmailSchema = z.infer<typeof emailSchema>;
export type UsernameSchema = z.infer<typeof usernameSchema>;
export type PasswordSchema = z.infer<typeof passwordSchema>;
export type PasswordConfirmationSchema = z.infer<
  typeof passwordConfirmationSchema
>;
export type LoginSchema = z.infer<typeof loginSchema>;
export type SignupSchema = z.infer<typeof signupSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
