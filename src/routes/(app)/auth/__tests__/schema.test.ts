import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  passwordConfirmationSchema,
} from '$lib/schema/auth-schema';

describe('Password Confirmation Schemas', () => {
  describe('signupSchema', () => {
    it('should pass with matching passwords', () => {
      const data = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'testpassword123',
        confirmPassword: 'testpassword123',
      };

      const result = signupSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with mismatching passwords', () => {
      const data = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'testpassword123',
        confirmPassword: 'differentpassword',
      };

      const result = signupSchema.safeParse(data);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['confirmPassword'],
              message: "Passwords don't match",
            }),
          ])
        );
      }
    });

    it('should fail with missing confirmPassword', () => {
      const data = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'testpassword123',
      };

      const result = signupSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('passwordConfirmationSchema', () => {
    it('should pass with matching passwords', () => {
      const data = {
        password: 'testpassword123',
        confirmPassword: 'testpassword123',
      };

      const result = passwordConfirmationSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with mismatching passwords', () => {
      const data = {
        password: 'testpassword123',
        confirmPassword: 'differentpassword',
      };

      const result = passwordConfirmationSchema.safeParse(data);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['confirmPassword'],
              message: "Passwords don't match",
            }),
          ])
        );
      }
    });

    it('should fail with too short passwords', () => {
      const data = {
        password: 'short',
        confirmPassword: 'short',
      };

      const result = passwordConfirmationSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
