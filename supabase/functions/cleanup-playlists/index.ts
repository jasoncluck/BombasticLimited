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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    console.log('🚀 Starting playlist cleanup process...');
    console.log('📝 Request time:', requestBody.time);

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔧 Supabase client created with service role key');

    // Call the cleanup function with explicit error handling
    console.log('📞 Calling cleanup_deleted_playlists RPC function...');

    const { data, error }: SupabaseRpcResponse = await supabase.rpc(
      'cleanup_deleted_playlists'
    );

    console.log('📊 RPC function result:', { data, error });

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
