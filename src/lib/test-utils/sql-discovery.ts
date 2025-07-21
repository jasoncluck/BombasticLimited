import { readdir, stat } from 'fs/promises';
import { join } from 'path';

export interface SqlFileInfo {
  name: string;
  path: string;
  type: 'migration' | 'seed' | 'function' | 'other';
  order?: number;
}

/**
 * Discover all SQL files in the supabase directory
 */
export async function discoverSqlFiles(supabaseDir: string): Promise<SqlFileInfo[]> {
  const files: SqlFileInfo[] = [];
  
  await walkDirectory(supabaseDir, files);
  
  // Sort migration files by their order
  files.sort((a, b) => {
    if (a.type === 'migration' && b.type === 'migration') {
      return (a.order || 0) - (b.order || 0);
    }
    return a.name.localeCompare(b.name);
  });
  
  return files;
}

/**
 * Recursively walk through directories to find SQL files
 */
async function walkDirectory(dir: string, files: SqlFileInfo[], basePath = ''): Promise<void> {
  try {
    const entries = await readdir(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await walkDirectory(fullPath, files, join(basePath, entry));
      } else if (entry.endsWith('.sql')) {
        const fileInfo = classifySqlFile(entry, fullPath, basePath);
        files.push(fileInfo);
      }
    }
  } catch (error) {
    // Directory might not exist or be accessible
    console.warn(`Could not read directory ${dir}:`, error);
  }
}

/**
 * Classify the type of SQL file based on its name and location
 */
function classifySqlFile(filename: string, fullPath: string, basePath: string): SqlFileInfo {
  const info: SqlFileInfo = {
    name: filename,
    path: fullPath,
    type: 'other',
  };

  // Check if it's in migrations directory
  if (basePath.includes('migrations') || basePath.includes('migration')) {
    info.type = 'migration';
    
    // Extract order from migration filename (e.g., 20250721023754_01_extensions_and_types.sql)
    const orderMatch = filename.match(/^(\d+)_/);
    if (orderMatch) {
      info.order = parseInt(orderMatch[1]);
    }
  }
  // Check if it's a seed file
  else if (filename.includes('seed')) {
    info.type = 'seed';
  }
  // Check if it's a function file
  else if (filename.includes('function') || filename.includes('proc')) {
    info.type = 'function';
  }

  return info;
}

/**
 * Get migration files in execution order
 */
export async function getMigrationFiles(supabaseDir: string): Promise<SqlFileInfo[]> {
  const allFiles = await discoverSqlFiles(supabaseDir);
  return allFiles.filter(file => file.type === 'migration');
}

/**
 * Get seed files
 */
export async function getSeedFiles(supabaseDir: string): Promise<SqlFileInfo[]> {
  const allFiles = await discoverSqlFiles(supabaseDir);
  return allFiles.filter(file => file.type === 'seed');
}

/**
 * Get function files
 */
export async function getFunctionFiles(supabaseDir: string): Promise<SqlFileInfo[]> {
  const allFiles = await discoverSqlFiles(supabaseDir);
  return allFiles.filter(file => file.type === 'function');
}