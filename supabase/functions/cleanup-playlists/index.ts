import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

interface CleanupRequestBody {
  time: string;
}

interface CleanupResponse {
  success: boolean;
  processedCount: number;
  error?: string;
  timestamp: string;
}

interface SupabaseRpcResponse {
  data: number | null;
  error: {
    message: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
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
      requestBody = (await req.json()) as CleanupRequestBody;
    } catch (parseError) {
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
    const supabaseUrl: string | undefined = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey: string | undefined = Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY'
    );

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      );
    }

    // Create Supabase client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the cleanup function
    const { data, error }: SupabaseRpcResponse = await supabase.rpc(
      'cleanup_deleted_playlists'
    );

    if (error) {
      console.error('Cleanup function error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        timestamp: new Date().toISOString(),
      });

      const errorResponse: CleanupResponse = {
        success: false,
        processedCount: 0,
        error: error.message,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const processedCount: number = data ?? 0;

    console.log(`Playlist cleanup completed successfully`, {
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

    console.error('Unexpected error in playlist cleanup:', {
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
