# Process Image Jobs Function

## Overview

The `process-image-jobs` Supabase Edge Function is an enhanced version of image processing with built-in queue management safeguards. It implements three key improvements to prevent queue overload and manage retry timing.

## Key Features

### 1. Queue Limit Check
- **Purpose**: Prevents queue overload
- **Behavior**: Checks if 100+ jobs are currently processing before submitting new jobs
- **Implementation**: Uses `get_image_processing_queue_status()` database function
- **Action**: Aborts processing if limit reached, returns status message

### 2. Retry Cooldown Management  
- **Purpose**: Prevents rapid retry loops for failed jobs
- **Behavior**: Implements 30-minute cooldown period before jobs can be retried
- **Implementation**: 
  - New jobs (0 attempts) process immediately
  - Failed jobs must wait 30 minutes from last `updated_at` timestamp
  - Uses `fail_image_processing_job()` to properly update timestamps
- **Action**: Skips jobs that are within cooldown period

### 3. Queue Availability Check
- **Purpose**: Ensures trigger queue is healthy before processing
- **Behavior**: Validates environment and queue health
- **Implementation**: Checks `TRIGGER_SECRET_KEY` environment variable
- **Action**: Aborts processing if queue is unhealthy

## Configuration

```typescript
const PROCESSING_QUEUE_LIMIT = 100;        // Max concurrent processing jobs
const RETRY_COOLDOWN_MINUTES = 30;         // Cooldown period for retries
const STUCK_JOB_THRESHOLD_MINUTES = 30;    // Threshold for stuck job reset
```

## API Response

### Success Response
```typescript
{
  success: true,
  processed: number,           // Jobs successfully processed
  skipped?: number,           // Jobs skipped (cooldown/max attempts)
  queueLimitReached?: boolean, // If queue limit was reached
  queueStatus: {              // Current queue status
    processing: number,
    pending: number,
    failed: number,
    completed: number
  },
  message: string,
  jobs?: ProcessedJob[]       // Details of processed jobs
}
```

### Error Response
```typescript
{
  success: false,
  error: string
}
```

## Usage

The function is called via HTTP POST request:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/process-image-jobs \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Behavior Flow

1. **Health Check**: Validate trigger queue availability
2. **Queue Status**: Get current processing job count
3. **Limit Check**: Abort if 100+ jobs already processing
4. **Stuck Job Reset**: Reset jobs stuck for 30+ minutes
5. **Job Filtering**: Filter jobs based on:
   - Max attempts not exceeded
   - 30-minute retry cooldown passed
6. **Batch Processing**: Process eligible jobs within available queue slots
7. **Error Handling**: Update failed jobs with proper cooldown timestamps

## Backward Compatibility

- Uses same database functions as existing system
- Maintains same trigger mechanism 
- Response structure includes all existing fields
- No changes to existing `process-images` function

## Error Handling

- Comprehensive logging for debugging
- Proper error propagation with context
- Failed jobs automatically get retry cooldown timestamps
- Graceful degradation on queue health issues