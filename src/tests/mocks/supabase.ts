import type {
  SupabaseClient,
  User,
  PostgrestError,
} from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import { vi } from "vitest";

// Define proper response types
interface PostgrestResponse<T> {
  data: T;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

interface PostgrestSingleResponse<T> {
  data: T | null;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

// Create a mock query builder that handles the chaining
const createMockQueryBuilder = () => {
  const mockBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    containedBy: vi.fn().mockReturnThis(),
    rangeGt: vi.fn().mockReturnThis(),
    rangeGte: vi.fn().mockReturnThis(),
    rangeLt: vi.fn().mockReturnThis(),
    rangeLte: vi.fn().mockReturnThis(),
    rangeAdjacent: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<unknown>),
    maybeSingle: vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<unknown>),
    csv: vi.fn().mockResolvedValue({
      data: "",
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<string>),
    geojson: vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<unknown>),
    explain: vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<unknown>),
    rollback: vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<unknown>),
    returns: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestResponse<unknown[]>),
  };

  // Make all methods return the builder for chaining
  Object.keys(mockBuilder).forEach((key) => {
    if (
      typeof mockBuilder[key as keyof typeof mockBuilder] === "function" &&
      ![
        "single",
        "maybeSingle",
        "csv",
        "geojson",
        "explain",
        "rollback",
        "then",
      ].includes(key)
    ) {
      mockBuilder[key as keyof typeof mockBuilder] = vi
        .fn()
        .mockReturnValue(mockBuilder);
    }
  });

  return mockBuilder;
};

// Create a deep mock of SupabaseClient with full type safety
export const createMockSupabaseClient = () => {
  const mockUser: User = {
    id: "test-user-id",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2025-01-01T00:00:00Z",
    email: "test@example.com",
  };

  const mockSupabase = {
    from: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { provider: "google", url: "https://example.com/oauth" },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as PostgrestSingleResponse<unknown>),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "" } }),
      }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    }),
    getChannels: vi.fn().mockReturnValue([]),
    removeChannel: vi.fn().mockResolvedValue({ data: null, error: null }),
    removeAllChannels: vi.fn().mockResolvedValue({ data: null, error: null }),

    // Add other required properties
    supabaseUrl: "https://test.supabase.co",
    supabaseKey: "test-key",
    realtime: {},
    realtimeUrl: "wss://test.supabase.co",
    restUrl: "https://test.supabase.co/rest/v1",
    storageUrl: "https://test.supabase.co/storage/v1",
    schema: "public",
    headers: {},
    fetch: fetch,
    shouldThrowOnError: false,
    apikey: "test-key",
  } as unknown as SupabaseClient<Database>;

  return mockSupabase;
};

// Helper function to create a mock query response
export const createMockQueryResponse = <T>(
  data: T,
  error: PostgrestError | null = null,
): PostgrestResponse<T> => ({
  data,
  error,
  count: null,
  status: 200,
  statusText: "OK",
});

// Helper function to create a mock error response
export const createMockErrorResponse = (
  message: string,
): PostgrestResponse<null> => ({
  data: null,
  error: {
    message,
    code: "PGRST116",
    name: "",
    details: "",
    hint: "",
  },
  count: null,
  status: 400,
  statusText: "Bad Request",
});

// Legacy export for backward compatibility
export const mockSupabase = {} as SupabaseClient<never, "public", never>;
