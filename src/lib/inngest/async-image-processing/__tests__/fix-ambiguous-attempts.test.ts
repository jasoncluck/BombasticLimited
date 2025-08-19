import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Migration 18: Fix Ambiguous Attempts Column', () => {
  const migrationPath = join(
    process.cwd(), 
    'supabase/migrations/20250101000001_18_fix_ambiguous_attempts_column.sql'
  );

  it('should have migration file', () => {
    expect(() => readFileSync(migrationPath, 'utf8')).not.toThrow();
  });

  it('should contain the fixed get_and_lock_next_image_processing_job function', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    
    // Should have the function definition
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_and_lock_next_image_processing_job');
    
    // Should fix the ambiguous column reference
    expect(migration).toContain('image_processing_jobs.attempts + 1');
    
    // Should NOT have the ambiguous reference
    expect(migration).not.toContain('attempts = attempts + 1');
    
    // Should use two-step approach
    expect(migration).toContain('SELECT j.id INTO selected_job_id');
    expect(migration).toContain('WHERE id = selected_job_id');
  });

  it('should use proper PostgreSQL table qualification syntax', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    
    // Should explicitly reference the table for the attempts column
    expect(migration).toContain('attempts = image_processing_jobs.attempts + 1');
    
    // Should maintain the aliased subquery
    expect(migration).toContain('FROM "public"."image_processing_jobs" j');
  });

  it('should preserve atomic behavior with FOR UPDATE SKIP LOCKED', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    
    // Should still use FOR UPDATE SKIP LOCKED for atomicity
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    
    // Should check for job existence before update
    expect(migration).toContain('IF selected_job_id IS NOT NULL THEN');
  });

  it('should maintain worker validation and logging', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    
    // Should still include worker ID parameter
    expect(migration).toContain('p_worker_id text');
    
    // Should maintain logging functionality
    expect(migration).toContain('[JOB_POLLER] Worker %');
    
    // Should return worker ID in results  
    expect(migration).toContain('worker_id = p_worker_id');
  });
});