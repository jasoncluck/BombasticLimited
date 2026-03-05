export interface BugReportFormData {
  title: string;
  description: string;
  steps_to_reproduce?: string;
  images?: string[];
}

export interface BugReportMetadata {
  page_url: string;
  user_agent: string;
  timestamp: string;
  user_id?: string;
}

export interface BugReportEvent extends BugReportFormData, BugReportMetadata {}

export interface BugReportSubmissionResult {
  success: boolean;
  error?: string;
}

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  path?: string; // Storage path for cleanup if needed
  error?: string;
}

export interface ImageFile {
  file: File;
  preview: string;
  id: string;
  uploaded?: boolean; // Track upload status
  uploadPath?: string; // Store path for cleanup
}
