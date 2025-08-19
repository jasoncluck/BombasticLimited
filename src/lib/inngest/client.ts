import { Inngest } from 'inngest';

// Create Inngest client for background image processing
export const inngest = new Inngest({
  id: 'bombastic',
  name: 'Bombastic Image Processing',
  retries: {
    default: 3,
  },
});

// Type definitions for image processing events
export interface ImageProcessingEvent {
  data: {
    entityType: 'video' | 'playlist';
    entityId: string;
    imageType: 'thumbnail' | 'thumbnail_maxres';
    sourceUrl: string;
    priority?: number;
  };
}

export interface BatchImageProcessingEvent {
  data: {
    jobs: Array<{
      entityType: 'video' | 'playlist';
      entityId: string;
      imageType: 'thumbnail' | 'thumbnail_maxres';
      sourceUrl: string;
      priority?: number;
    }>;
  };
}

export interface CleanupJobsEvent {
  data: {
    olderThanHours?: number;
    status?: 'failed' | 'completed';
  };
}
