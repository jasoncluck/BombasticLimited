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

// Cognito's password policy requires upper+lower+digit (no symbol
// requirement) — matched here so the form gives feedback before the
// request round-trips to Cognito.
const newPassword = z
  .string()
  .min(8)
  .max(256)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

// Schema for password confirmation (used in signup and password reset)
export const passwordConfirmationSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(8).max(256),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Signup schema with password confirmation
export const signupSchema = emailSchema
  .merge(usernameSchema)
  .merge(
    z.object({
      password: newPassword,
      confirmPassword: z.string().min(8).max(256),
    })
  )
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const loginSchema = emailSchema.merge(passwordSchema);

export const forgotPasswordSchema = emailSchema;

export const confirmSignUpSchema = z.object({
  email: z.string().email().max(50),
  code: z.string().min(1, 'Confirmation code is required'),
});

// Cognito's ForgotPassword flow is code-based, not session-based — the
// confirmation page needs the email + emailed code, not just a new password.
export const resetPasswordConfirmSchema = z
  .object({
    email: z.string().email().max(50),
    code: z.string().min(1, 'Confirmation code is required'),
    password: newPassword,
    confirmPassword: z.string().min(8).max(256),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

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
export type ResetPasswordConfirmSchema = z.infer<
  typeof resetPasswordConfirmSchema
>;
export type ConfirmSignUpSchema = z.infer<typeof confirmSignUpSchema>;
