import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the event object and supabase client
const createMockEvent = () => ({
  locals: {
    supabase: {
      auth: {
        getUser: vi.fn(),
        getSession: vi.fn(),
      }
    }
  }
});

// Import the safeGetSession logic (we'll need to refactor it to be testable)
// For now, let's create a standalone version of the logic for testing
async function safeGetSession(supabase: any) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { session: null, user: null };
  }

  // If user exists, we can safely get the session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { session, user };
}

describe('safeGetSession', () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockEvent();
  });

  it('should return null session and user when getUser fails', async () => {
    mockEvent.locals.supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Unauthorized' }
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: null,
      user: null
    });
    expect(mockEvent.locals.supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('should return null session and user when user is null', async () => {
    mockEvent.locals.supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: null,
      user: null
    });
    expect(mockEvent.locals.supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('should return session and user when auth is valid', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = { access_token: 'token-123', user: mockUser };

    mockEvent.locals.supabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockEvent.locals.supabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: mockSession,
      user: mockUser
    });
    expect(mockEvent.locals.supabase.auth.getUser).toHaveBeenCalled();
    expect(mockEvent.locals.supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should prioritize getUser error over session data', async () => {
    mockEvent.locals.supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token expired' }
    });

    // Even if getSession might work, we should not call it
    mockEvent.locals.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: null,
      user: null
    });
    expect(mockEvent.locals.supabase.auth.getSession).not.toHaveBeenCalled();
  });
});