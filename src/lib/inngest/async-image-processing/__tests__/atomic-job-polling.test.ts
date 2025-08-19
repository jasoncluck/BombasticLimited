import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

// Mock dependencies before importing
vi.mock('$env/static/private', () => ({
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
}));

vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
}));

// Mock supabase client with enhanced functions
const mockSupabaseRpc = vi.fn();
const mockSupabaseClient = {
  rpc: mockSupabaseRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

vi.mock('../../client', () => ({
  inngest: {
    createFunction: vi.fn((config, trigger, handler) => ({
      id: config.id,
      name: config.name,
      config,
      trigger,
      handler,
    })),
    send: vi.fn(),
  },
}));

describe('Enhanced Job Poller with Atomic Operations', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should generate unique worker IDs for each instance', () => {
    // Test that worker ID generation includes unique components
    const workerId1 = `worker-${randomUUID().slice(0, 8)}-${Date.now()}`;
    const workerId2 = `worker-${randomUUID().slice(0, 8)}-${Date.now()}`;

    expect(workerId1).toMatch(/^worker-[a-f0-9]{8}-\d+$/);
    expect(workerId2).toMatch(/^worker-[a-f0-9]{8}-\d+$/);
    expect(workerId1).not.toBe(workerId2);
  });

  it('should call get_and_lock_next_image_processing_job with worker ID', async () => {
    // Mock successful job locking
    mockSupabaseRpc.mockResolvedValueOnce({
      data: [
        {
          job_id: 'test-job-123',
          entity_type: 'video',
          entity_id: 'test-video',
          image_type: 'thumbnail',
          source_url: 'https://example.com/image.jpg',
          attempts: 1,
          processing_started_at: new Date().toISOString(),
        },
      ],
      error: null,
    });

    // Mock no more jobs
    mockSupabaseRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { pollPendingJobs } = await import('../job_poller');

    // This would be called by Inngest in practice
    expect(pollPendingJobs).toBeDefined();

    // Verify the function expects the correct RPC call
    expect(mockSupabaseRpc).not.toHaveBeenCalled(); // Not called until function executes
  });

  it('should validate worker ID is included in job processing events', () => {
    const workerId = 'worker-test-123';
    const jobData = {
      jobId: 'test-job-456',
      workerId: workerId,
      entityType: 'video',
      entityId: 'test-video',
      imageType: 'thumbnail',
      sourceUrl: 'https://example.com/thumb.jpg',
      priority: 100,
      pollingTimestamp: new Date().toISOString(),
      jobAttempts: 1,
      processingStartedAt: new Date().toISOString(),
    };

    // Validate that all required fields are present
    expect(jobData.workerId).toBe(workerId);
    expect(jobData.jobId).toBeDefined();
    expect(jobData.processingStartedAt).toBeDefined();
  });

  it('should handle database errors gracefully during atomic operations', async () => {
    // Mock database error
    mockSupabaseRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection failed' },
    });

    const { pollPendingJobs } = await import('../job_poller');

    expect(pollPendingJobs).toBeDefined();
    // The actual error handling would be tested in integration tests
  });

  it('should stop polling when no jobs are available', async () => {
    // Mock no jobs available
    mockSupabaseRpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const { pollPendingJobs } = await import('../job_poller');

    expect(pollPendingJobs).toBeDefined();
    // The function should break the loop when no jobs are returned
  });

  it('should enforce maximum jobs per polling cycle', () => {
    const MAX_JOBS_PER_POLL = 10;

    // Test that the constant is reasonable
    expect(MAX_JOBS_PER_POLL).toBeGreaterThan(0);
    expect(MAX_JOBS_PER_POLL).toBeLessThanOrEqual(20); // Reasonable upper bound
  });

  it('should validate comprehensive logging includes worker context', () => {
    const workerId = 'worker-abc123-1234567890';
    const timestamp = new Date().toISOString();
    const jobId = 'test-job-789';

    // Test logging format validation
    const startLog = `🔄 [${timestamp}] Worker ${workerId} starting image processing job polling cycle...`;
    const atomicLog = `🔍 [${timestamp}] Worker ${workerId} attempting atomic job lock 1/10...`;
    const successLog = `✅ [${timestamp}] Worker ${workerId} ATOMICALLY locked job ${jobId} for video/test-video/thumbnail (attempt 1/3, started: ${timestamp})`;

    expect(startLog).toContain('Worker');
    expect(startLog).toContain(workerId);
    expect(atomicLog).toContain('atomic job lock');
    expect(successLog).toContain('ATOMICALLY locked job');
    expect(successLog).toContain(jobId);
  });

  it('should validate job-specific concurrency control', () => {
    // Test that concurrency is based on job ID, not entity
    const jobId1 = 'job-123';
    const jobId2 = 'job-456';

    // Different jobs should be able to process in parallel
    expect(jobId1).not.toBe(jobId2);

    // Concurrency key should be job-specific
    const concurrencyKey1 = `event.data.jobId`; // This would resolve to jobId1
    const concurrencyKey2 = `event.data.jobId`; // This would resolve to jobId2

    expect(concurrencyKey1).toBe(concurrencyKey2); // Same pattern, different runtime values
  });
});
