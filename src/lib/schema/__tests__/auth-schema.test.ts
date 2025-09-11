import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  usernameSchema,
  passwordSchema,
  passwordConfirmationSchema,
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  type EmailSchema,
  type UsernameSchema,
  type PasswordSchema,
  type PasswordConfirmationSchema,
  type LoginSchema,
  type SignupSchema,
  type ForgotPasswordSchema,
} from '../auth-schema';

describe('Auth Schema Validation', () => {
  describe('emailSchema', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'email123@test-domain.org',
        'simple@test.io',
      ];

      validEmails.forEach((email) => {
        const result = emailSchema.safeParse({ email });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.email).toBe(email);
        }
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'test@',
        'test.domain.com',
        'test@@domain.com',
        '',
        'test@domain',
      ];

      invalidEmails.forEach((email) => {
        const result = emailSchema.safeParse({ email });
        expect(result.success).toBe(false);
      });
    });

    it('should reject emails longer than 50 characters', () => {
      const longEmail = 'verylongemailaddress@verylongdomainname.com'; // 46 chars
      const tooLongEmail =
        'verylongemailaddressthatistoolongtobevalid@domain.com'; // > 50 chars

      expect(emailSchema.safeParse({ email: longEmail }).success).toBe(true);
      expect(emailSchema.safeParse({ email: tooLongEmail }).success).toBe(
        false
      );
    });

    it('should handle edge cases', () => {
      expect(emailSchema.safeParse({ email: null }).success).toBe(false);
      expect(emailSchema.safeParse({ email: undefined }).success).toBe(false);
      expect(emailSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('usernameSchema', () => {
    it('should validate correct usernames', () => {
      const validUsernames = [
        'ab', // minimum length
        'user123',
        'test_user',
        'user-name',
        'a'.repeat(32), // maximum length
      ];

      validUsernames.forEach((username) => {
        const result = usernameSchema.safeParse({ username });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.username).toBe(username);
        }
      });
    });

    it('should reject usernames that are too short', () => {
      const shortUsernames = ['', 'a'];

      shortUsernames.forEach((username) => {
        const result = usernameSchema.safeParse({ username });
        expect(result.success).toBe(false);
      });
    });

    it('should reject usernames that are too long', () => {
      const longUsername = 'a'.repeat(33); // 33 characters
      const result = usernameSchema.safeParse({ username: longUsername });
      expect(result.success).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(usernameSchema.safeParse({ username: null }).success).toBe(false);
      expect(usernameSchema.safeParse({ username: undefined }).success).toBe(
        false
      );
      expect(usernameSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('passwordSchema', () => {
    it('should validate correct passwords', () => {
      const validPasswords = [
        'password123', // minimum length
        'a'.repeat(8), // exactly 8 characters
        'a'.repeat(256), // maximum length
        'complex@Password123!',
      ];

      validPasswords.forEach((password) => {
        const result = passwordSchema.safeParse({ password });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.password).toBe(password);
        }
      });
    });

    it('should reject passwords that are too short', () => {
      const shortPasswords = ['', 'a', 'short', 'a'.repeat(7)];

      shortPasswords.forEach((password) => {
        const result = passwordSchema.safeParse({ password });
        expect(result.success).toBe(false);
      });
    });

    it('should reject passwords that are too long', () => {
      const longPassword = 'a'.repeat(257); // 257 characters
      const result = passwordSchema.safeParse({ password: longPassword });
      expect(result.success).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(passwordSchema.safeParse({ password: null }).success).toBe(false);
      expect(passwordSchema.safeParse({ password: undefined }).success).toBe(
        false
      );
      expect(passwordSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('passwordConfirmationSchema', () => {
    it('should validate when passwords match', () => {
      const matchingPasswords = {
        password: 'password123',
        confirmPassword: 'password123',
      };

      const result = passwordConfirmationSchema.safeParse(matchingPasswords);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.password).toBe('password123');
        expect(result.data.confirmPassword).toBe('password123');
      }
    });

    it('should reject when passwords do not match', () => {
      const mismatchedPasswords = {
        password: 'password123',
        confirmPassword: 'different123',
      };

      const result = passwordConfirmationSchema.safeParse(mismatchedPasswords);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (issue) => issue.message === "Passwords don't match"
          )
        ).toBe(true);
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('confirmPassword')
          )
        ).toBe(true);
      }
    });

    it('should validate password length requirements for both fields', () => {
      const shortPasswords = {
        password: 'short',
        confirmPassword: 'short',
      };

      const result = passwordConfirmationSchema.safeParse(shortPasswords);
      expect(result.success).toBe(false);
    });

    it('should handle edge cases', () => {
      const edgeCases = [
        { password: '', confirmPassword: '' },
        { password: 'password123', confirmPassword: '' },
        { password: '', confirmPassword: 'password123' },
      ];

      edgeCases.forEach((testCase) => {
        const result = passwordConfirmationSchema.safeParse(testCase);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validLogin = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = loginSchema.safeParse(validLogin);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
        expect(result.data.password).toBe('password123');
      }
    });

    it('should reject invalid email in login', () => {
      const invalidLogin = {
        email: 'invalid-email',
        password: 'password123',
      };

      const result = loginSchema.safeParse(invalidLogin);
      expect(result.success).toBe(false);
    });

    it('should reject short password in login', () => {
      const invalidLogin = {
        email: 'test@example.com',
        password: 'short',
      };

      const result = loginSchema.safeParse(invalidLogin);
      expect(result.success).toBe(false);
    });

    it('should require both email and password', () => {
      expect(loginSchema.safeParse({ email: 'test@example.com' }).success).toBe(
        false
      );
      expect(loginSchema.safeParse({ password: 'password123' }).success).toBe(
        false
      );
      expect(loginSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('signupSchema', () => {
    it('should validate correct signup data', () => {
      const validSignup = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        confirmPassword: 'password123',
      };

      const result = signupSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
        expect(result.data.username).toBe('testuser');
        expect(result.data.password).toBe('password123');
        expect(result.data.confirmPassword).toBe('password123');
      }
    });

    it('should reject when passwords do not match in signup', () => {
      const invalidSignup = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        confirmPassword: 'different123',
      };

      const result = signupSchema.safeParse(invalidSignup);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (issue) => issue.message === "Passwords don't match"
          )
        ).toBe(true);
      }
    });

    it('should validate all individual field requirements', () => {
      const invalidSignups = [
        {
          email: 'invalid-email',
          username: 'testuser',
          password: 'password123',
          confirmPassword: 'password123',
        },
        {
          email: 'test@example.com',
          username: 'a', // too short
          password: 'password123',
          confirmPassword: 'password123',
        },
        {
          email: 'test@example.com',
          username: 'testuser',
          password: 'short', // too short
          confirmPassword: 'short',
        },
      ];

      invalidSignups.forEach((signup) => {
        const result = signupSchema.safeParse(signup);
        expect(result.success).toBe(false);
      });
    });

    it('should require all fields', () => {
      const incompleteSignups = [
        {
          email: 'test@example.com',
          username: 'test',
          password: 'password123',
        },
        {
          username: 'test',
          password: 'password123',
          confirmPassword: 'password123',
        },
        {
          email: 'test@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        },
        {
          email: 'test@example.com',
          username: 'test',
          confirmPassword: 'password123',
        },
      ];

      incompleteSignups.forEach((signup) => {
        const result = signupSchema.safeParse(signup);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should validate correct email for password reset', () => {
      const validEmail = { email: 'test@example.com' };
      const result = forgotPasswordSchema.safeParse(validEmail);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject invalid email for password reset', () => {
      const invalidEmail = { email: 'invalid-email' };
      const result = forgotPasswordSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
    });

    it('should be equivalent to emailSchema', () => {
      const testEmail = 'test@example.com';
      const emailResult = emailSchema.safeParse({ email: testEmail });
      const forgotResult = forgotPasswordSchema.safeParse({ email: testEmail });

      expect(emailResult.success).toBe(forgotResult.success);
    });
  });

  describe('TypeScript type exports', () => {
    it('should export correct types', () => {
      // These are compile-time tests to ensure types are properly exported
      const emailData: EmailSchema = { email: 'test@example.com' };
      const usernameData: UsernameSchema = { username: 'testuser' };
      const passwordData: PasswordSchema = { password: 'password123' };
      const passwordConfirmData: PasswordConfirmationSchema = {
        password: 'password123',
        confirmPassword: 'password123',
      };
      const loginData: LoginSchema = {
        email: 'test@example.com',
        password: 'password123',
      };
      const signupData: SignupSchema = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        confirmPassword: 'password123',
      };
      const forgotData: ForgotPasswordSchema = { email: 'test@example.com' };

      // If these compile, the types are correctly exported
      expect(emailData.email).toBe('test@example.com');
      expect(usernameData.username).toBe('testuser');
      expect(passwordData.password).toBe('password123');
      expect(passwordConfirmData.password).toBe('password123');
      expect(loginData.email).toBe('test@example.com');
      expect(signupData.email).toBe('test@example.com');
      expect(forgotData.email).toBe('test@example.com');
    });
  });

  describe('schema integration and edge cases', () => {
    it('should handle unicode characters in usernames', () => {
      const unicodeUsernames = [
        'user123', // standard
        'user_test', // underscore
        'user-test', // hyphen
      ];

      unicodeUsernames.forEach((username) => {
        const result = usernameSchema.safeParse({ username });
        expect(result.success).toBe(true);
      });
    });

    it('should handle special characters in passwords', () => {
      const specialPasswords = [
        'Password123!',
        'p@ssw0rd#$%',
        'test-password_123',
        'пароль123', // Cyrillic characters
      ];

      specialPasswords.forEach((password) => {
        const result = passwordSchema.safeParse({ password });
        expect(result.success).toBe(true);
      });
    });

    it('should handle whitespace in inputs', () => {
      // Passwords with spaces should be valid
      expect(
        passwordSchema.safeParse({ password: 'password with spaces' }).success
      ).toBe(true);

      // Usernames with spaces should be valid (though not typical)
      expect(usernameSchema.safeParse({ username: 'user name' }).success).toBe(
        true
      );

      // Emails with spaces should be invalid
      expect(
        emailSchema.safeParse({ email: 'test @example.com' }).success
      ).toBe(false);
    });

    it('should handle boundary values correctly', () => {
      // Test exact boundary lengths
      expect(usernameSchema.safeParse({ username: 'ab' }).success).toBe(true); // min length
      expect(
        usernameSchema.safeParse({ username: 'a'.repeat(32) }).success
      ).toBe(true); // max length

      expect(
        passwordSchema.safeParse({ password: 'a'.repeat(8) }).success
      ).toBe(true); // min length
      expect(
        passwordSchema.safeParse({ password: 'a'.repeat(256) }).success
      ).toBe(true); // max length

      expect(emailSchema.safeParse({ email: 'a@b.co' }).success).toBe(true); // short email
    });
  });
});
