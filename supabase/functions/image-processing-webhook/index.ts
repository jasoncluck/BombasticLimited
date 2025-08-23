import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { tasks } from 'npm:@trigger.dev/sdk@3.0.0/v3';
import type { processImageWebhook } from '../../../src/trigger/image-processing-worker.ts';

interface ImageProperties {
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  [key: string]: unknown;
}

interface WebhookRecord {
  id: string;
  thumbnail_url?: string;
  image_properties?: ImageProperties;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: 'videos' | 'playlists';
  record: WebhookRecord;
  old_record?: Partial<WebhookRecord>;
}

interface ErrorResponse {
  success: false;
  error: string;
}

interface SuccessResponse {
  success: true;
  runId: string;
  message: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
} as const;

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: WebhookPayload = await req.json();

    console.log('Received webhook:', {
      type: payload.type,
      table: payload.table,
      recordId: payload.record.id,
    });

    // Validate required environment variable
    if (!Deno.env.get('TRIGGER_SECRET_KEY')) {
      throw new Error('Missing TRIGGER_SECRET_KEY environment variable');
    }

    // Trigger the task using the SDK
    const run = await tasks.trigger<typeof processImageWebhook>(
      'process-image-webhook',
      payload
    );

    console.log('Successfully triggered image processing:', run.id);

    const successResponse: SuccessResponse = {
      success: true,
      runId: run.id,
      message: 'Image processing job queued',
    };

    return new Response(JSON.stringify(successResponse), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: 200,
    });
  } catch (error) {
    console.error('Webhook error:', error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: 500,
    });
  }
});
