import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the event object and supabase client
const createMockEvent = () => ({
  locals: {
    supabase: {
      auth: {
        getClaims: vi.fn(),
        getUser: vi.fn(),
        getSession: vi.fn(),
      }
    }
  }
});

// Import the safeGetSession logic (we'll need to refactor it to be testable)
// For now, let's create a standalone version of the logic for testing
async function safeGetSession(supabase: any) {
  try {
    const {
      data,
      error,
    } = await supabase.auth.getClaims();
    
    if (error || !data.claims) {
      return { session: null, user: null };
    }

    // If claims exist, get the session (claims validate the JWT)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Create user object from claims
    const user = session?.user || null;

    return { session, user };
  } catch (error) {
    // Fallback to getUser if getClaims is not available
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { session: null, user: null };
    }

    // If user exists, we can safely get the session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return { session, user };
  }
}

describe('safeGetSession', () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockEvent();
  });

  it('should return null session and user when getClaims fails', async () => {
    mockEvent.locals.supabase.auth.getClaims.mockResolvedValue({
      data: { claims: null },
      error: { message: 'Unauthorized' }
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: null,
      user: null
    });
    expect(mockEvent.locals.supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('should return null session and user when claims are null', async () => {
    mockEvent.locals.supabase.auth.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: null,
      user: null
    });
    expect(mockEvent.locals.supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('should return session and user when claims are valid', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = { access_token: 'token-123', user: mockUser };
    const mockClaims = { sub: 'user-123', email: 'test@example.com' };

    mockEvent.locals.supabase.auth.getClaims.mockResolvedValue({
      data: { claims: mockClaims },
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
    expect(mockEvent.locals.supabase.auth.getClaims).toHaveBeenCalled();
    expect(mockEvent.locals.supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should fallback to getUser when getClaims throws error', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = { access_token: 'token-123', user: mockUser };

    // Make getClaims throw an error (method not available)
    mockEvent.locals.supabase.auth.getClaims.mockRejectedValue(new Error('getClaims not available'));

    // Setup fallback mocks
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
    expect(mockEvent.locals.supabase.auth.getClaims).toHaveBeenCalled();
    expect(mockEvent.locals.supabase.auth.getUser).toHaveBeenCalled();
    expect(mockEvent.locals.supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should return null when fallback getUser also fails', async () => {
    // Make getClaims throw an error
    mockEvent.locals.supabase.auth.getClaims.mockRejectedValue(new Error('getClaims not available'));

    // Make getUser fail too
    mockEvent.locals.supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token expired' }
    });

    const result = await safeGetSession(mockEvent.locals.supabase);

    expect(result).toEqual({
      session: null,
      user: null
    });
    expect(mockEvent.locals.supabase.auth.getClaims).toHaveBeenCalled();
    expect(mockEvent.locals.supabase.auth.getUser).toHaveBeenCalled();
    expect(mockEvent.locals.supabase.auth.getSession).not.toHaveBeenCalled();
  });
});