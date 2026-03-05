import { describe, it, expect, vi, beforeEach } from 'vitest';
import { superValidate, fail } from 'sveltekit-superforms';
import { setFlash } from 'sveltekit-flash-message/server';
import { load, actions } from '../+page.server';
import {
  getUserProfile,
  checkIfUsernameIsUnique,
  getUserDiscordIdentity,
  linkDiscordIdentity,
  unlinkDiscordIdentity,
} from '$lib/supabase/user-profiles';

// Mock dependencies
vi.mock('@sveltejs/kit', () => ({}));

vi.mock('sveltekit-superforms', () => ({
  superValidate: vi.fn(),
  fail: vi.fn((status, data) => ({ status, ...data })),
}));

vi.mock('sveltekit-superforms/adapters', () => ({
  zod: vi.fn((schema) => schema),
}));

vi.mock('sveltekit-flash-message/server', () => ({
  redirect: vi.fn(() => {
    throw new Error('Redirect');
  }),
  setFlash: vi.fn(),
}));

// Import the mocked redirect from sveltekit-flash-message/server
import { redirect as flashRedirect } from 'sveltekit-flash-message/server';
import {
  createMockProfileResponse,
  createMockSession,
  createMockSuperValidated,
  createMockUserProfile,
} from '$lib/tests/test-utils';
const mockFlashRedirect = vi.mocked(flashRedirect);

vi.mock('bad-words', () => {
  const mockIsProfane = vi.fn(() => false);
  const mockFilterConstructor = vi.fn(() => ({
    isProfane: mockIsProfane,
  }));

  // Export module with mock functions that can be accessed
  const mockModule = {
    default: mockFilterConstructor,
    Filter: mockFilterConstructor,
    mockIsProfane,
    mockFilterConstructor,
  };

  // Store references globally for test access
  (globalThis as any).badWordsMocks = {
    mockIsProfane,
    mockFilterConstructor,
  };

  return mockModule;
});

vi.mock('$lib/supabase/user-profiles', () => ({
  getUserProfile: vi.fn(),
  checkIfUsernameIsUnique: vi.fn(),
  getUserDiscordIdentity: vi.fn(),
  linkDiscordIdentity: vi.fn(),
  unlinkDiscordIdentity: vi.fn(),
}));

vi.mock('$lib/schema/auth-schema', () => ({
  emailSchema: {},
  passwordSchema: {},
  usernameSchema: {},
}));
const mockRequest = {
  method: 'POST',
  formData: vi
    .fn()
    .mockResolvedValue(new Map([['email', 'newemail@example.com']])),
  // Add other properties your code might need
} as any;

const mockFail = vi.mocked(fail);
const mockSuperValidate = vi.mocked(superValidate);
const mockSetFlash = vi.mocked(setFlash);
const mockGetUserProfile = vi.mocked(getUserProfile);
const mockCheckIfUsernameIsUnique = vi.mocked(checkIfUsernameIsUnique);
const mockGetUserDiscordIdentity = vi.mocked(getUserDiscordIdentity);

describe('account/+page.server.ts', () => {
  const mockSession = createMockSession();
  const mockUserProfile = createMockUserProfile();
  const mockCookies = {
    delete: vi.fn(),
  } as any;

  const mockSupabase = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            sub: mockSession.user.id,
            email: mockSession.user.email,
            role: 'authenticated',
          },
        },
        error: null,
      }),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the profanity mock to return false by default
    const { mockIsProfane } = (globalThis as any).badWordsMocks;
    mockIsProfane.mockReturnValue(false);
    // Set up default mock for getUserDiscordIdentity
    mockGetUserDiscordIdentity.mockResolvedValue({
      identity: null,
      error: null,
    });
  });

  describe('load function', () => {
    const mockLoadEvent: any = {
      depends: vi.fn(),
      locals: {
        supabase: mockSupabase,
      },
    };

    it('should load data for authenticated user', async () => {
      mockGetUserProfile.mockResolvedValue(
        createMockProfileResponse(mockUserProfile)
      );
      mockGetUserDiscordIdentity.mockResolvedValue({
        identity: null,
        error: null,
      });
      mockSuperValidate
        .mockResolvedValueOnce(
          createMockSuperValidated({ email: mockSession.user.email })
        )
        .mockResolvedValueOnce(createMockSuperValidated({}))
        .mockResolvedValueOnce(
          createMockSuperValidated({ username: mockUserProfile.username })
        );

      const result = await load(mockLoadEvent);

      expect(mockLoadEvent.depends).toHaveBeenCalledWith(
        'supabase:db:profiles'
      );
      expect(mockGetUserProfile).toHaveBeenCalledWith({
        supabase: mockSupabase,
      });
      expect(mockGetUserDiscordIdentity).toHaveBeenCalledWith({
        supabase: mockSupabase,
      });
      expect((result as any).profile).toEqual(mockUserProfile);
    });

    it('should redirect when no session', async () => {
      // Mock getClaims to return no claims/error for this test
      mockSupabase.auth.getClaims.mockResolvedValueOnce({
        data: null,
        error: { message: 'No session' },
      });

      const noSessionLoadEvent = {
        ...mockLoadEvent,
        locals: {
          ...mockLoadEvent.locals,
        },
      };

      await expect(load(noSessionLoadEvent)).rejects.toThrow('Redirect');
      expect(mockFlashRedirect).toHaveBeenCalledWith(303, '/auth/login');
    });

    it('should execute profile fetch and form validations in parallel', async () => {
      const startTime = Date.now();
      let getUserProfileTime: number | null = null;
      let superValidateTime: number | null = null;

      mockGetUserProfile.mockImplementation(async () => {
        getUserProfileTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createMockProfileResponse(mockUserProfile);
      });

      mockGetUserDiscordIdentity.mockResolvedValue({
        identity: null,
        error: null,
      });

      mockSuperValidate.mockImplementation(async (...args) => {
        if (!superValidateTime) superValidateTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 5));
        return createMockSuperValidated({});
      });

      await load(mockLoadEvent);

      expect(getUserProfileTime).not.toBeNull();
      expect(superValidateTime).not.toBeNull();

      if (getUserProfileTime && superValidateTime) {
        const timeDifference = Math.abs(getUserProfileTime - superValidateTime);
        expect(timeDifference).toBeLessThan(20);
      }
    });

    it('should initialize forms with correct data', async () => {
      mockGetUserProfile.mockResolvedValue(
        createMockProfileResponse(mockUserProfile)
      );
      mockGetUserDiscordIdentity.mockResolvedValue({
        identity: null,
        error: null,
      });
      mockSuperValidate
        .mockResolvedValueOnce(
          createMockSuperValidated({ email: 'test@example.com' })
        )
        .mockResolvedValueOnce(createMockSuperValidated({}))
        .mockResolvedValueOnce(
          createMockSuperValidated({ username: 'testuser' })
        );

      const result = await load(mockLoadEvent);

      expect(mockSuperValidate).toHaveBeenCalledWith(
        { email: mockSession.user.email },
        expect.anything(),
        { errors: true }
      );
      expect(mockSuperValidate).toHaveBeenCalledWith(
        { username: mockUserProfile.username },
        expect.anything(),
        { errors: false }
      );
    });

    it('should handle missing profile gracefully', async () => {
      mockGetUserProfile.mockResolvedValue({ profile: null, error: null });
      mockGetUserDiscordIdentity.mockResolvedValue({
        identity: null,
        error: null,
      });
      mockSuperValidate
        .mockResolvedValueOnce(
          createMockSuperValidated({ email: 'test@example.com' })
        )
        .mockResolvedValueOnce(createMockSuperValidated({}))
        .mockResolvedValueOnce(createMockSuperValidated({ username: '' }));

      const result = await load(mockLoadEvent);

      expect((result as any).profile).toBeNull();
      expect(mockSuperValidate).toHaveBeenCalledWith(
        { username: '' },
        expect.anything(),
        { errors: false }
      );
    });
  });

  describe('updateEmail action', () => {
    const mockActionEvent: any = {
      url: new URL('http://localhost:5173'),
      request: mockRequest,
      cookies: mockCookies,
      locals: { supabase: mockSupabase },
    };

    beforeEach(() => {
      mockSuperValidate.mockResolvedValue(
        createMockSuperValidated({ email: 'newemail@example.com' })
      );
    });

    it('should update email successfully', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: {
          user: {
            email: 'test@example.com',
            new_email: 'newemail@example.com',
          },
        },
        error: null,
      });

      await actions.updateEmail(mockActionEvent);

      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith(
        { email: 'newemail@example.com' },
        { emailRedirectTo: 'http://localhost:5173/auth/email/confirm' }
      );
      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          field: 'email',
        }),
        mockCookies
      );
    });

    it('should handle email update error', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: null,
        error: { message: 'Email already exists', code: 'user_already_exists' },
      });

      const result = await actions.updateEmail(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Email address already registered.',
        }),
        mockCookies
      );
      expect(mockFail).toHaveBeenCalledWith(400, expect.anything());
    });

    it('should handle generic email update error', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: null,
        error: { message: 'Generic error' },
      });

      const result = await actions.updateEmail(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Generic error',
          field: 'email',
        }),
        mockCookies
      );
    });
  });

  describe('updateUsername action', () => {
    const mockActionEvent: any = {
      request: mockRequest,
      cookies: mockCookies,
      locals: { supabase: mockSupabase },
    };

    beforeEach(() => {
      mockSuperValidate.mockResolvedValue(
        createMockSuperValidated({ username: 'newusername' })
      );
    });

    it('should update username successfully', async () => {
      mockCheckIfUsernameIsUnique.mockResolvedValue(true);
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      const result = await actions.updateUsername(mockActionEvent);

      expect(mockCheckIfUsernameIsUnique).toHaveBeenCalledWith({
        username: 'newusername',
        supabase: mockSupabase,
      });
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        data: { username: 'newusername' },
      });
      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: 'Updated username to newusername',
          field: 'username',
        }),
        mockCookies
      );
    });

    it('should reject profane username', async () => {
      // Configure the mock to return true (profane) for this test
      const { mockIsProfane } = (globalThis as any).badWordsMocks;
      mockIsProfane.mockReturnValueOnce(true);
      mockCheckIfUsernameIsUnique.mockResolvedValue(true);

      const result = await actions.updateUsername(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message:
            'Offensisve langage detected in username, choose another name.',
          field: 'username',
        }),
        mockCookies
      );
      expect(mockFail).toHaveBeenCalledWith(400, expect.anything());
    });

    it('should reject non-unique username', async () => {
      mockCheckIfUsernameIsUnique.mockResolvedValue(false);

      const result = await actions.updateUsername(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Username already exists and must be unique.',
          field: 'username',
        }),
        mockCookies
      );
      expect(mockFail).toHaveBeenCalledWith(400, expect.anything());
    });

    it('should handle username update error', async () => {
      mockCheckIfUsernameIsUnique.mockResolvedValue(true);
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      const result = await actions.updateUsername(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Update failed',
          field: 'username',
        }),
        mockCookies
      );
      expect(mockFail).toHaveBeenCalledWith(400, expect.anything());
    });

    it('should run uniqueness check and profanity filter in parallel', async () => {
      const startTime = Date.now();
      let uniquenessCheckTime: number | null = null;
      let profanityCheckTime: number | null = null;

      mockCheckIfUsernameIsUnique.mockImplementation(async () => {
        uniquenessCheckTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      });

      // Mock the Filter constructor to capture timing
      const { mockFilterConstructor } = (globalThis as any).badWordsMocks;
      mockFilterConstructor.mockImplementation(() => {
        profanityCheckTime = Date.now();
        return {
          isProfane: () => false,
        };
      });

      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      await actions.updateUsername(mockActionEvent);

      expect(uniquenessCheckTime).not.toBeNull();
      expect(profanityCheckTime).not.toBeNull();

      if (uniquenessCheckTime && profanityCheckTime) {
        const timeDifference = Math.abs(
          uniquenessCheckTime - profanityCheckTime
        );
        expect(timeDifference).toBeLessThan(20);
      }
    });
  });

  describe('resetPassword action', () => {
    const mockActionEvent: any = {
      cookies: mockCookies,
      locals: { supabase: mockSupabase, session: mockSession },
    };

    it('should send password reset email successfully', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      });

      const result = await actions.resetPassword(mockActionEvent);

      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        mockSession.user.email,
        { redirectTo: '/auth/password/update' }
      );
      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: `Password reset email sent to ${mockSession.user.email}.`,
          field: 'password',
        }),
        mockCookies
      );
    });

    it('should handle password reset error', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: null,
        error: { message: 'Email not found' },
      });

      const result = await actions.resetPassword(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Email not found',
          field: 'password',
        }),
        mockCookies
      );
      expect(mockFail).toHaveBeenCalledWith(400);
    });

    it('should throw error when session has no email', async () => {
      // Mock getClaims to return claims without email
      mockSupabase.auth.getClaims.mockResolvedValueOnce({
        data: {
          claims: {
            sub: mockSession.user.id,
            // email is missing
            role: 'authenticated',
          },
        },
        error: null,
      });

      const sessionWithoutEmail = {
        ...mockSession,
        user: { ...mockSession.user, email: null },
      };

      const actionEventWithoutEmail = {
        ...mockActionEvent,
        locals: { ...mockActionEvent.locals, session: sessionWithoutEmail },
      };

      await expect(
        actions.resetPassword(actionEventWithoutEmail)
      ).rejects.toThrow(
        `Could not find email for account: ${sessionWithoutEmail.user.id}`
      );
    });

    it('should throw error when no session', async () => {
      // Mock getClaims to return error for no session
      mockSupabase.auth.getClaims.mockResolvedValueOnce({
        data: null,
        error: { message: 'No session' },
      });

      const actionEventWithoutSession = {
        ...mockActionEvent,
        locals: { ...mockActionEvent.locals, session: null },
      };

      await expect(
        actions.resetPassword(actionEventWithoutSession)
      ).rejects.toThrow('Could not find email for account: undefined');
    });
  });

  describe('deleteAccount action', () => {
    const mockActionEvent: any = {
      cookies: mockCookies,
      locals: { supabase: mockSupabase, session: mockSession },
    };

    it('should delete account successfully', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: null,
      });
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      });

      await expect(actions.deleteAccount(mockActionEvent)).rejects.toThrow(
        'Redirect'
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_user');
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(mockCookies.delete).toHaveBeenCalledWith('sb-access-token', {
        path: '/',
      });
      expect(mockCookies.delete).toHaveBeenCalledWith('sb-refresh-token', {
        path: '/',
      });
    });

    it('should handle delete account error', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Delete failed' },
      });

      const result = await actions.deleteAccount(mockActionEvent);

      expect(mockSetFlash).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Delete failed',
          field: 'delete',
        }),
        mockCookies
      );
      expect(mockFail).toHaveBeenCalledWith(400);
    });

    it('should redirect when no session', async () => {
      // Mock getClaims to return error for no session
      mockSupabase.auth.getClaims.mockResolvedValueOnce({
        data: null,
        error: { message: 'No session' },
      });

      const actionEventWithoutSession = {
        ...mockActionEvent,
        locals: { ...mockActionEvent.locals, session: null },
      };

      await expect(
        actions.deleteAccount(actionEventWithoutSession)
      ).rejects.toThrow('Redirect');
      expect(mockFlashRedirect).toHaveBeenCalledWith(303, '/login');
    });

    it('should clean up auth cookies on successful deletion', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });

      await expect(actions.deleteAccount(mockActionEvent)).rejects.toThrow(
        'Redirect'
      );

      expect(mockCookies.delete).toHaveBeenCalledWith('sb-access-token', {
        path: '/',
      });
      expect(mockCookies.delete).toHaveBeenCalledWith('sb-refresh-token', {
        path: '/',
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle getUserProfile errors', async () => {
      const mockLoadEvent: any = {
        depends: vi.fn(),
        locals: {
          supabase: mockSupabase,
          session: mockSession,
        },
      };

      mockGetUserProfile.mockRejectedValue(new Error('Database error'));

      await expect(load(mockLoadEvent)).rejects.toThrow('Database error');
    });

    it('should handle superValidate errors', async () => {
      const mockLoadEvent: any = {
        depends: vi.fn(),
        locals: {
          supabase: mockSupabase,
          session: mockSession,
        },
      };

      mockGetUserProfile.mockResolvedValue(
        createMockProfileResponse(mockUserProfile)
      );
      mockSuperValidate.mockRejectedValue(new Error('Form validation error'));

      await expect(load(mockLoadEvent)).rejects.toThrow(
        'Form validation error'
      );
    });

    it('should handle checkIfUsernameIsUnique errors', async () => {
      const mockActionEvent: any = {
        request: mockRequest,
        cookies: mockCookies,
        locals: { supabase: mockSupabase },
      };

      mockSuperValidate.mockResolvedValue(
        createMockSuperValidated({ username: 'newusername' })
      );
      mockCheckIfUsernameIsUnique.mockRejectedValue(new Error('Network error'));

      await expect(actions.updateUsername(mockActionEvent)).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('form data validation', () => {
    it('should validate email form data structure', async () => {
      const mockLoadEvent: any = {
        depends: vi.fn(),
        locals: {
          supabase: mockSupabase,
          session: mockSession,
        },
      };

      mockGetUserProfile.mockResolvedValue(
        createMockProfileResponse(mockUserProfile)
      );
      mockGetUserDiscordIdentity.mockResolvedValue({
        identity: null,
        error: null,
      });
      mockSuperValidate
        .mockResolvedValueOnce(
          createMockSuperValidated({ email: 'test@example.com' })
        )
        .mockResolvedValueOnce(createMockSuperValidated({}))
        .mockResolvedValueOnce(
          createMockSuperValidated({ username: 'testuser' })
        );

      const result = await load(mockLoadEvent);

      expect((result as any).emailForm).toHaveProperty('data');
      expect((result as any).emailForm.data).toHaveProperty('email');
    });

    it('should validate username form data structure', async () => {
      const mockLoadEvent: any = {
        depends: vi.fn(),
        locals: {
          supabase: mockSupabase,
          session: mockSession,
        },
      };

      mockGetUserProfile.mockResolvedValue(
        createMockProfileResponse(mockUserProfile)
      );
      mockGetUserDiscordIdentity.mockResolvedValue({
        identity: null,
        error: null,
      });
      mockSuperValidate
        .mockResolvedValueOnce(
          createMockSuperValidated({ email: 'test@example.com' })
        )
        .mockResolvedValueOnce(createMockSuperValidated({}))
        .mockResolvedValueOnce(
          createMockSuperValidated({ username: 'testuser' })
        );

      const result = await load(mockLoadEvent);

      expect((result as any).usernameForm).toHaveProperty('data');
      expect((result as any).usernameForm.data).toHaveProperty('username');
    });
  });
});
