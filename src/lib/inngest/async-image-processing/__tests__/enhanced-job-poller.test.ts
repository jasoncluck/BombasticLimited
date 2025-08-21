import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
const mockSupabaseRpc = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockSelect = vi.fn();
const mockAbortSignal = vi.fn();

vi.mock('$env/static/private', () => ({
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
}));

vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockSupabaseRpc,
    from: mockSupabaseFrom,
  })),
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

// Import after mocking
import { pollPendingJobs } from '../job_poller';

describe('Enhanced Job Poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      abortSignal: mockAbortSignal,
    });
    mockAbortSignal.mockResolvedValue({ data: [], error: null });
  });

  describe('Configuration', () => {
    it('should have enhanced configuration constants', () => {
      // Test that the function is properly configured
      expect(pollPendingJobs).toBeDefined();
      expect(pollPendingJobs.id).toBe('poll-pending-jobs');
      expect(pollPendingJobs.name).toBe('Poll Pending Image Processing Jobs');
      expect(pollPendingJobs.config.retries).toBe(3);
      expect(pollPendingJobs.config.concurrency.limit).toBe(1);
    });
  });

  describe('Stale Job Cleanup', () => {
    it('should call cleanup_stale_processing_jobs with 10-minute threshold', async () => {
      // Mock successful cleanup
      mockSupabaseRpc.mockImplementation((funcName, params) => {
        if (funcName === 'cleanup_stale_processing_jobs') {
          expect(params.stale_threshold_minutes).toBe(10);
          return Promise.resolve({ data: 5, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      // Execute the handler
      await pollPendingJobs.handler({ step: mockStep });

      // Verify cleanup was called with correct threshold
      expect(mockSupabaseRpc).toHaveBeenCalledWith(
        'cleanup_stale_processing_jobs',
        { stale_threshold_minutes: 10 }
      );
    });

    it('should retry cleanup on failure', async () => {
      let callCount = 0;
      mockSupabaseRpc.mockImplementation((funcName) => {
        if (funcName === 'cleanup_stale_processing_jobs') {
          callCount++;
          if (callCount < 3) {
            return Promise.resolve({
              data: null,
              error: { message: 'Connection failed' },
            });
          }
          return Promise.resolve({ data: 2, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      // Execute the handler
      await pollPendingJobs.handler({ step: mockStep });

      // Verify retry attempts
      expect(callCount).toBe(3);
    });
  });

  describe('Enhanced Diagnostics', () => {
    it('should fetch job status counts for diagnostics', async () => {
      // Mock job status data
      const mockJobData = [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'processing' },
        { status: 'completed' },
        { status: 'failed' },
      ];

      mockAbortSignal.mockResolvedValue({ data: mockJobData, error: null });
      mockSupabaseRpc.mockResolvedValue({ data: 0, error: null });

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      const result = await pollPendingJobs.handler({ step: mockStep });

      // Verify job counts are included in result
      expect(result.jobCounts).toEqual({
        pending: 2,
        processing: 1,
        completed: 1,
        failed: 1,
        total: 5,
      });
    });

    it('should warn about large numbers of stale jobs', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock large stale job count
      mockSupabaseRpc.mockImplementation((funcName) => {
        if (funcName === 'cleanup_stale_processing_jobs') {
          return Promise.resolve({ data: 15, error: null }); // Above threshold of 10
        }
        return Promise.resolve({ data: [], error: null });
      });

      mockAbortSignal.mockResolvedValue({ data: [], error: null });

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      await pollPendingJobs.handler({ step: mockStep });

      // Verify warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'WARNING: Large number of stale jobs detected (15)'
        )
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should retry database operations on failure', async () => {
      let queryAttempts = 0;
      mockSupabaseRpc.mockImplementation((funcName) => {
        if (funcName === 'get_next_image_processing_job_with_worker') {
          queryAttempts++;
          if (queryAttempts < 3) {
            return Promise.resolve({
              data: null,
              error: { message: 'Connection timeout' },
            });
          }
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: 0, error: null });
      });

      mockAbortSignal.mockResolvedValue({ data: [], error: null });

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      await pollPendingJobs.handler({ step: mockStep });

      // Verify retry attempts
      expect(queryAttempts).toBe(3);
    });

    it('should handle Inngest send failures gracefully', async () => {
      // Mock pending job
      const mockJob = {
        job_id: 'test-job-1',
        entity_type: 'video',
        entity_id: 'video-123',
        image_type: 'thumbnail',
        source_url: 'https://example.com/image.jpg',
        worker_id: 'worker-test',
        attempts: 1,
      };

      mockSupabaseRpc.mockImplementation((funcName) => {
        if (funcName === 'get_next_image_processing_job_with_worker') {
          return Promise.resolve({ data: mockJob, error: null });
        }
        return Promise.resolve({ data: 0, error: null });
      });

      mockAbortSignal.mockResolvedValue({ data: [], error: null });
      mockInngestSend.mockRejectedValue(
        new Error('Inngest service unavailable')
      );

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      const result = await pollPendingJobs.handler({ step: mockStep });

      // Verify error handling
      expect(result.success).toBe(true); // Overall success despite send failure
      expect(result.errors).toBe(1);
      expect(result.jobsSent).toBe(0);
      expect(result.jobsPolled).toBe(1);
    });
  });

  describe('Return Values', () => {
    it('should return enhanced result structure', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 0, error: null });
      mockAbortSignal.mockResolvedValue({ data: [], error: null });

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      const result = await pollPendingJobs.handler({ step: mockStep });

      // Verify enhanced result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('jobsPolled');
      expect(result).toHaveProperty('jobsSent');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('staleJobsReset');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('jobCounts');
      expect(result).toHaveProperty('message');
    });
  });
});
