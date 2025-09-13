import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface CleanupRequestBody {
  readonly time: string;
}

interface CleanupResponse {
  readonly success: boolean;
  readonly processedCount: number;
  readonly error?: string;
  readonly timestamp: string;
}

interface SupabaseRpcResponse {
  readonly data: number | null;
  readonly error: {
    readonly message: string;
    readonly details?: string;
    readonly hint?: string;
    readonly code?: string;
  } | null;
}

interface EnvironmentVariables {
  readonly SUPABASE_URL: string | undefined;
  readonly SUPABASE_SERVICE_ROLE_KEY: string | undefined;
}

serve(async (req: Request): Promise<Response> => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    const errorResponse: CleanupResponse = {
      success: false,
      processedCount: 0,
      error: 'Method not allowed',
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        Allow: 'POST',
      },
    });
  }

  try {
    // Parse request body
    let requestBody: CleanupRequestBody;
    try {
      const bodyText = await req.text();
      requestBody = JSON.parse(bodyText) as CleanupRequestBody;
    } catch (parseError: unknown) {
      const errorResponse: CleanupResponse = {
        success: false,
        processedCount: 0,
        error: 'Invalid JSON in request body',
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate environment variables
    const env: EnvironmentVariables = {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    };

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      );
    }

    console.log(
      '🚀 Starting playlist cleanup with service role authentication'
    );

    // Create Supabase client with service role key for admin operations
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log('✅ Supabase client created, calling cleanup function...');

    // Call the cleanup function
    const { data, error }: SupabaseRpcResponse = await supabase.rpc(
      'cleanup_deleted_playlists'
    );

    if (error) {
      console.error('❌ Cleanup function error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        timestamp: new Date().toISOString(),
      });

      const errorResponse: CleanupResponse = {
        success: false,
        processedCount: 0,
        error: `Database error: ${error.message}${error.code ? ` (Code: ${error.code})` : ''}`,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const processedCount: number = data ?? 0;

    console.log('✅ Playlist cleanup completed successfully', {
      processedCount,
      requestTime: requestBody.time,
      completedAt: new Date().toISOString(),
    });

    const successResponse: CleanupResponse = {
      success: true,
      processedCount,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage: string =
      error instanceof Error ? error.message : 'Unknown error occurred';

    console.error('❌ Unexpected error in playlist cleanup:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    const errorResponse: CleanupResponse = {
      success: false,
      processedCount: 0,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
