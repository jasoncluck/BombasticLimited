import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SvelteKit dependencies
vi.mock('$app/navigation', () => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
}));

// Test auth error handling logic in isolation
describe('Layout Auth Error Handling Logic', () => {
  let mockSupabaseAuth: any;
  let mockSupabase: any;
  let mockInvalidate: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSupabaseAuth = {
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getClaims: vi.fn(),
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    };

    mockSupabase = {
      auth: mockSupabaseAuth,
    };

    // Get the mocked invalidate function
    const navigation = await import('$app/navigation');
    mockInvalidate = navigation.invalidate;
  });

  // Create the auth error handler function to test
  const createHandleAuthError = (supabase: any, invalidate: any) => {
    return async function handleAuthError(
      error: any,
      context: string
    ): Promise<boolean> {
      // Check if this is a 403 auth error
      const is403Error =
        error?.status === 403 ||
        error?.code === 403 ||
        error?.message?.includes('403') ||
        error?.response?.status === 403;

      if (is403Error) {
        console.warn(
          `🔐 Auth 403 error detected in ${context}, cleaning up auth state:`,
          error
        );

        try {
          // Clean up auth state using signOut
          await supabase.auth.signOut();

          // Invalidate auth to ensure fresh state
          await invalidate('supabase:auth');

          console.log(
            `✅ Auth state cleaned up successfully after 403 error in ${context}`
          );
          return true; // Indicate successful cleanup
        } catch (cleanupError) {
          console.error(
            `❌ Failed to clean up auth state after 403 error in ${context}:`,
            cleanupError
          );
          return false;
        }
      }

      return false; // Not a 403 error, no cleanup performed
    };
  };

  it('should detect 403 error by status property and clean up auth state', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error403 = { status: 403, message: 'Forbidden' };

    const result = await handleAuthError(error403, 'test context');

    expect(result).toBe(true);
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();
    expect(mockInvalidate).toHaveBeenCalledWith('supabase:auth');
  });

  it('should detect 403 error by code property', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error403 = { code: 403, message: 'Authentication failed' };

    const result = await handleAuthError(error403, 'test context');

    expect(result).toBe(true);
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();
    expect(mockInvalidate).toHaveBeenCalledWith('supabase:auth');
  });

  it('should detect 403 error in message text', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error403 = { message: 'Error 403: Access denied' };

    const result = await handleAuthError(error403, 'test context');

    expect(result).toBe(true);
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();
    expect(mockInvalidate).toHaveBeenCalledWith('supabase:auth');
  });

  it('should detect 403 error in response.status', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error403 = { response: { status: 403 } };

    const result = await handleAuthError(error403, 'test context');

    expect(result).toBe(true);
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();
    expect(mockInvalidate).toHaveBeenCalledWith('supabase:auth');
  });

  it('should not trigger cleanup for non-403 errors', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error404 = { status: 404, message: 'Not found' };
    const error500 = { status: 500, message: 'Internal server error' };
    const genericError = { message: 'Something went wrong' };

    const result404 = await handleAuthError(error404, 'test context');
    const result500 = await handleAuthError(error500, 'test context');
    const resultGeneric = await handleAuthError(genericError, 'test context');

    expect(result404).toBe(false);
    expect(result500).toBe(false);
    expect(resultGeneric).toBe(false);
    expect(mockSupabaseAuth.signOut).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('should handle signOut errors gracefully', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error403 = { status: 403 };

    // Mock signOut to throw an error
    mockSupabaseAuth.signOut.mockRejectedValue(new Error('SignOut failed'));

    const result = await handleAuthError(error403, 'test context');

    expect(result).toBe(false); // Should return false when cleanup fails
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();
    // invalidate should not be called when signOut fails
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('should handle invalidate errors gracefully', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);
    const error403 = { status: 403 };

    // Mock invalidate to throw an error
    mockInvalidate.mockRejectedValue(new Error('Invalidate failed'));

    const result = await handleAuthError(error403, 'test context');

    expect(result).toBe(false); // Should return false when cleanup fails
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();
    expect(mockInvalidate).toHaveBeenCalledWith('supabase:auth');
  });

  // Test the data refresh function with auth error handling
  const createPerformDataRefresh = (
    handleAuthError: any,
    sidebarState: any,
    navigationState: any,
    invalidate: any
  ) => {
    return async function performDataRefresh(
      reason: string,
      includeAuth: boolean = false,
      retryAfterAuthCleanup: boolean = false
    ) {
      try {
        // Step 1: Invalidate auth first if requested
        if (includeAuth) {
          await invalidate('supabase:auth');
        }

        // Step 2: Refresh sidebar and navigation state concurrently
        sidebarState.refreshData();
        navigationState.refreshData();
      } catch (error) {
        console.error(`Failed to perform data refresh - ${reason}:`, error);

        // Handle 403 auth errors with cleanup and retry
        const cleanupPerformed = await handleAuthError(
          error,
          `performDataRefresh - ${reason}`
        );

        if (cleanupPerformed && !retryAfterAuthCleanup) {
          // Retry once after successful auth cleanup
          console.log(
            `🔄 Retrying data refresh after auth cleanup for: ${reason}`
          );
          try {
            await performDataRefresh(
              `${reason} (retry after auth cleanup)`,
              true,
              true
            );
          } catch (retryError) {
            console.error(
              `Failed to retry data refresh after auth cleanup - ${reason}:`,
              retryError
            );
          }
        }
      }
    };
  };

  it('should retry data refresh after successful auth cleanup', async () => {
    // Reset invalidate to not fail for this test
    const workingInvalidate = vi.fn().mockResolvedValue(undefined);
    const handleAuthError = createHandleAuthError(
      mockSupabase,
      workingInvalidate
    );

    const mockSidebarState = {
      refreshData: vi.fn(),
    };

    const mockNavigationState = {
      refreshData: vi.fn(),
    };

    const performDataRefresh = createPerformDataRefresh(
      handleAuthError,
      mockSidebarState,
      mockNavigationState,
      workingInvalidate
    );

    // Mock refreshData to fail first time with 403, then succeed on retry
    let callCount = 0;
    mockSidebarState.refreshData.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw { status: 403 }; // Fail first time
      }
      return Promise.resolve(); // Succeed on retry
    });

    await performDataRefresh('test refresh');

    // Verify auth cleanup was triggered
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledOnce();

    // Verify retry happened (original call + retry call)
    expect(mockSidebarState.refreshData).toHaveBeenCalledTimes(2);
  });

  it('should not retry if cleanup was not successful', async () => {
    const handleAuthError = createHandleAuthError(mockSupabase, mockInvalidate);

    // Mock signOut to fail
    mockSupabaseAuth.signOut.mockRejectedValue(new Error('SignOut failed'));

    const mockSidebarState = {
      refreshData: vi.fn().mockRejectedValue({ status: 403 }),
    };

    const mockNavigationState = {
      refreshData: vi.fn(),
    };

    const performDataRefresh = createPerformDataRefresh(
      handleAuthError,
      mockSidebarState,
      mockNavigationState,
      mockInvalidate
    );

    await performDataRefresh('test refresh');

    // Verify no retry happened since cleanup failed
    expect(mockSidebarState.refreshData).toHaveBeenCalledTimes(1);
  });
});
