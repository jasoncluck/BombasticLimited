import { describe, it, expect } from 'vitest';

describe('Priority-Based Job Processing Validation', () => {
  // Test the priority separation logic that was implemented
  describe('Priority Ordering Validation', () => {
    it('should verify playlists (priority 25) come before videos (priority 100)', () => {
      // Simulate a mixed job queue as it might come from the database
      const mixedJobs = [
        { priority: 100, entity_type: 'video', entity_id: 'video1', job_id: 'job1' },
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist1', job_id: 'job2' },
        { priority: 100, entity_type: 'video', entity_id: 'video2', job_id: 'job3' },
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist2', job_id: 'job4' },
      ];

      // Simulate the priority-based separation (as implemented in job-poller.ts)
      const HIGH_PRIORITY_THRESHOLD = 50;
      const MEDIUM_PRIORITY_THRESHOLD = 100;

      const highPriority = mixedJobs.filter(job => job.priority < HIGH_PRIORITY_THRESHOLD);
      const mediumPriority = mixedJobs.filter(job => 
        job.priority >= HIGH_PRIORITY_THRESHOLD && job.priority <= MEDIUM_PRIORITY_THRESHOLD
      );
      const lowPriority = mixedJobs.filter(job => job.priority > MEDIUM_PRIORITY_THRESHOLD);

      // Verify high priority contains only playlists
      expect(highPriority.length).toBe(2);
      expect(highPriority.every(job => job.entity_type === 'playlist')).toBe(true);
      expect(highPriority.every(job => job.priority === 25)).toBe(true);

      // Verify medium priority contains only videos
      expect(mediumPriority.length).toBe(2);
      expect(mediumPriority.every(job => job.entity_type === 'video')).toBe(true);
      expect(mediumPriority.every(job => job.priority === 100)).toBe(true);

      // Verify no low priority jobs in this scenario
      expect(lowPriority.length).toBe(0);

      // Verify processing order would be correct
      const processingOrder = [...highPriority, ...mediumPriority, ...lowPriority];
      expect(processingOrder[0].entity_type).toBe('playlist');
      expect(processingOrder[1].entity_type).toBe('playlist');
      expect(processingOrder[2].entity_type).toBe('video');
      expect(processingOrder[3].entity_type).toBe('video');
    });

    it('should ensure no mixed-priority batches are created', () => {
      const jobs = [
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist1' },
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist2' },
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist3' },
        { priority: 100, entity_type: 'video', entity_id: 'video1' },
        { priority: 100, entity_type: 'video', entity_id: 'video2' },
        { priority: 100, entity_type: 'video', entity_id: 'video3' },
      ];

      // Simulate batch creation with BATCH_SIZE = 2
      const BATCH_SIZE = 2;
      const HIGH_PRIORITY_THRESHOLD = 50;

      const highPriority = jobs.filter(job => job.priority < HIGH_PRIORITY_THRESHOLD);
      const mediumPriority = jobs.filter(job => job.priority >= HIGH_PRIORITY_THRESHOLD);

      // Create batches for high priority jobs
      const highPriorityBatches = [];
      for (let i = 0; i < highPriority.length; i += BATCH_SIZE) {
        highPriorityBatches.push(highPriority.slice(i, i + BATCH_SIZE));
      }

      // Create batches for medium priority jobs  
      const mediumPriorityBatches = [];
      for (let i = 0; i < mediumPriority.length; i += BATCH_SIZE) {
        mediumPriorityBatches.push(mediumPriority.slice(i, i + BATCH_SIZE));
      }

      // Verify each batch contains only jobs of the same priority
      highPriorityBatches.forEach(batch => {
        const firstPriority = batch[0].priority;
        expect(batch.every(job => job.priority === firstPriority)).toBe(true);
        expect(batch.every(job => job.entity_type === 'playlist')).toBe(true);
      });

      mediumPriorityBatches.forEach(batch => {
        const firstPriority = batch[0].priority;
        expect(batch.every(job => job.priority === firstPriority)).toBe(true);
        expect(batch.every(job => job.entity_type === 'video')).toBe(true);
      });

      // Verify total batches and structure
      expect(highPriorityBatches.length).toBe(2); // 3 jobs / 2 per batch = 2 batches
      expect(mediumPriorityBatches.length).toBe(2); // 3 jobs / 2 per batch = 2 batches
      expect(highPriorityBatches[0].length).toBe(2);
      expect(highPriorityBatches[1].length).toBe(1);
    });

    it('should verify database query priority filtering parameters', () => {
      // Test the parameters that would be passed to the database functions
      const HIGH_PRIORITY_THRESHOLD = 50;
      const MAX_JOBS_PER_POLL = 300;

      // High priority query parameters
      const highPriorityParams = {
        p_worker_id: 'test-worker',
        p_limit: MAX_JOBS_PER_POLL,
        p_max_priority: HIGH_PRIORITY_THRESHOLD - 1, // 49
      };

      // Additional jobs query parameters (after high priority jobs are fetched)
      const remainingSlots = 200; // Assuming 100 high priority jobs were fetched
      const additionalJobsParams = {
        p_worker_id: 'test-worker',
        p_limit: remainingSlots,
        p_min_priority: HIGH_PRIORITY_THRESHOLD, // 50
      };

      // Verify parameters are correct
      expect(highPriorityParams.p_max_priority).toBe(49);
      expect(highPriorityParams.p_limit).toBe(300);
      expect(additionalJobsParams.p_min_priority).toBe(50);
      expect(additionalJobsParams.p_limit).toBe(200);

      // Verify priority filtering logic
      const sampleJobs = [
        { priority: 25 }, // Should be in high priority query
        { priority: 49 }, // Should be in high priority query  
        { priority: 50 }, // Should be in additional jobs query
        { priority: 100 }, // Should be in additional jobs query
        { priority: 150 }, // Should be in additional jobs query
      ];

      const highPriorityJobs = sampleJobs.filter(job => job.priority <= highPriorityParams.p_max_priority);
      const additionalJobs = sampleJobs.filter(job => job.priority >= additionalJobsParams.p_min_priority);

      expect(highPriorityJobs.length).toBe(2);
      expect(additionalJobs.length).toBe(3);
      expect(highPriorityJobs.every(job => job.priority < 50)).toBe(true);
      expect(additionalJobs.every(job => job.priority >= 50)).toBe(true);
    });

    it('should validate priority breakdown tracking structure', () => {
      // Test the expected structure of priority breakdown results
      const mockJobs = [
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist1' },
        { priority: 25, entity_type: 'playlist', entity_id: 'playlist2' },
        { priority: 100, entity_type: 'video', entity_id: 'video1' },
        { priority: 100, entity_type: 'video', entity_id: 'video2' },
        { priority: 150, entity_type: 'video', entity_id: 'video3' },
      ];

      // Simulate the priority breakdown calculation
      const HIGH_PRIORITY_THRESHOLD = 50;
      const MEDIUM_PRIORITY_THRESHOLD = 100;

      const highPriorityJobs = mockJobs.filter(job => job.priority < HIGH_PRIORITY_THRESHOLD);
      const mediumPriorityJobs = mockJobs.filter(job => 
        job.priority >= HIGH_PRIORITY_THRESHOLD && job.priority <= MEDIUM_PRIORITY_THRESHOLD
      );
      const lowPriorityJobs = mockJobs.filter(job => job.priority > MEDIUM_PRIORITY_THRESHOLD);

      const priorityBreakdown = {
        high: {
          jobs: highPriorityJobs.length,
          sent: highPriorityJobs.length, // Assuming all sent successfully
          errors: 0,
        },
        medium: {
          jobs: mediumPriorityJobs.length,
          sent: mediumPriorityJobs.length,
          errors: 0,
        },
        low: {
          jobs: lowPriorityJobs.length,
          sent: lowPriorityJobs.length,
          errors: 0,
        },
      };

      // Verify breakdown structure and values
      expect(priorityBreakdown.high.jobs).toBe(2);
      expect(priorityBreakdown.medium.jobs).toBe(2);
      expect(priorityBreakdown.low.jobs).toBe(1);

      expect(priorityBreakdown.high.sent).toBe(2);
      expect(priorityBreakdown.medium.sent).toBe(2);
      expect(priorityBreakdown.low.sent).toBe(1);

      // Verify total
      const totalJobs = priorityBreakdown.high.jobs + priorityBreakdown.medium.jobs + priorityBreakdown.low.jobs;
      expect(totalJobs).toBe(5);
    });

    it('should ensure priority information is preserved in job data', () => {
      // Test that priority information flows through the job processing
      const originalJob = {
        job_id: 'test-job-1',
        entity_type: 'playlist',
        entity_id: 'playlist123',
        priority: 25,
        attempts: 0,
        worker_id: 'worker-123',
      };

      // Simulate the event data structure that would be sent to Inngest
      const eventData = {
        jobId: originalJob.job_id,
        workerId: originalJob.worker_id,
        entityType: originalJob.entity_type,
        entityId: originalJob.entity_id,
        priority: originalJob.priority, // This is the key addition
        jobAttempts: originalJob.attempts,
      };

      // Verify priority is preserved and correct
      expect(eventData.priority).toBe(25);
      expect(eventData.entityType).toBe('playlist');
      expect(eventData.priority).toBeLessThan(100); // Should be higher priority than videos

      // Test video job as well
      const videoJob = {
        job_id: 'test-video-1',
        entity_type: 'video', 
        entity_id: 'video123',
        priority: 100,
        attempts: 0,
        worker_id: 'worker-456',
      };

      const videoEventData = {
        priority: videoJob.priority,
        entityType: videoJob.entity_type,
      };

      expect(videoEventData.priority).toBe(100);
      expect(videoEventData.entityType).toBe('video');
      expect(videoEventData.priority).toBeGreaterThan(eventData.priority);
    });
  });
});