/**
 * Test file discovery and loading
 * Handles finding and importing test files
 */

import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { pathToFileURL } from 'url';

export interface LoaderOptions {
  pattern?: RegExp;
  recursive?: boolean;
}

// Match all .ts and .js files (not just .test files)
const DEFAULT_PATTERN = /\.(ts|js)$/;

/**
 * Discover test files in a directory or direct file paths
 */
export async function discoverTests(
  paths: string[],
  options: LoaderOptions = {}
): Promise<string[]> {
  const pattern = options.pattern ?? DEFAULT_PATTERN;
  const recursive = options.recursive ?? true;

  const testFiles: string[] = [];

  for (const path of paths) {
    try {
      const stats = await stat(path);

      if (stats.isFile()) {
        // Direct file path - add it if it matches pattern or has test extension
        if (pattern.test(path) || isTestFile(path)) {
          testFiles.push(path);
        }
      } else if (stats.isDirectory()) {
        // Directory - discover files recursively
        const files = await findTestFiles(path, pattern, recursive);
        testFiles.push(...files);
      }
    } catch (error) {
      // If path doesn't exist, skip it
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return testFiles;
}

/**
 * Recursively find test files matching pattern
 */
async function findTestFiles(
  dirPath: string,
  pattern: RegExp,
  recursive: boolean
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory() && recursive) {
        const nestedFiles = await findTestFiles(fullPath, pattern, recursive);
        files.push(...nestedFiles);
      } else if (stats.isFile() && pattern.test(entry)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // If path doesn't exist or can't be read, skip it
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

/**
 * Load a test file and execute it to register tests
 */
export async function loadTestFile(filePath: string): Promise<void> {
  // Convert file path to URL for ESM import
  const fileUrl = pathToFileURL(filePath).href;

  // Set the current file in registry to create file-level suite
  const { registry } = await import('../api/test.js');
  registry.setCurrentFile(filePath);

  try {
    // Import the test file - this will execute the file and register tests
    // Note: TypeScript support requires running with tsx loader
    await import(fileUrl);
  } catch (error) {
    throw new Error(`Failed to load test file ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Load multiple test files
 */
export async function loadTestFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    await loadTestFile(filePath);
  }
}

/**
 * Check if a path is a test file based on extension
 */
export function isTestFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === '.ts' || ext === '.js';
}

/**
 * Filter test suites by name or pattern
 */
export function filterSuites<T extends { name: string }>(
  suites: T[],
  pattern?: string | RegExp
): T[] {
  if (!pattern) {
    return suites;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  return suites.filter((suite) => regex.test(suite.name));
}

/**
 * Filter test cases within suites by name or pattern
 */
export function filterTests<T extends { tests: { name: string }[] }>(
  suites: T[],
  pattern?: string | RegExp
): T[] {
  if (!pattern) {
    return suites;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  return suites.map((suite) => ({
    ...suite,
    tests: suite.tests.filter((test) => regex.test(test.name)),
  })).filter((suite) => suite.tests.length > 0);
}
