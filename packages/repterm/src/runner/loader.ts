/**
 * Test file discovery and loading
 * Handles finding and importing test files with directory-level setup support
 */

import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { pathToFileURL } from 'url';
import type { TestSuite } from './models.js';

export interface LoaderOptions {
  pattern?: RegExp;
  recursive?: boolean;
}

// Match all .ts and .js files (not just .test files)
const DEFAULT_PATTERN = /\.(ts|js)$/;

// Setup file name (without extension)
const SETUP_FILE_NAME = 'setup';

/**
 * Check if a file is a setup file
 */
function isSetupFile(fileName: string): boolean {
  const name = basename(fileName, extname(fileName));
  return name === SETUP_FILE_NAME;
}

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
  // Import from relative path to ensure we use the same registry instance
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
 * Directory suite info for hierarchical loading
 */
interface DirectorySuiteInfo {
  dirPath: string;
  suite: TestSuite;
  setupFile?: string;
  testFiles: string[];
  subdirs: string[];
}

/**
 * Analyze a directory and return its structure
 */
async function analyzeDirectory(
  dirPath: string,
  pattern: RegExp
): Promise<DirectorySuiteInfo> {
  const entries = await readdir(dirPath);

  let setupFile: string | undefined;
  const testFiles: string[] = [];
  const subdirs: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      subdirs.push(fullPath);
    } else if (stats.isFile() && pattern.test(entry)) {
      if (isSetupFile(entry)) {
        setupFile = fullPath;
      } else {
        testFiles.push(fullPath);
      }
    }
  }

  // Create a directory suite
  const dirName = basename(dirPath);

  const suite: TestSuite = {
    id: `dir-${dirPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
    name: dirName,
    tests: [],
    suites: [],
    config: {},
  };

  return {
    dirPath,
    suite,
    setupFile,
    testFiles,
    subdirs,
  };
}

/**
 * Load a directory with setup.ts support
 * Creates directory-level suites and executes setup files
 */
export async function loadDirectory(
  dirPath: string,
  parentSuite: TestSuite | null = null,
  pattern: RegExp = DEFAULT_PATTERN
): Promise<TestSuite> {
  const { registry } = await import('../api/test.js');
  const info = await analyzeDirectory(dirPath, pattern);

  // Link to parent if provided
  if (parentSuite) {
    info.suite.parent = parentSuite;
    if (!parentSuite.suites) {
      parentSuite.suites = [];
    }
    parentSuite.suites.push(info.suite);
  }

  // Push the directory suite onto the stack
  registry.pushSuite(info.suite);

  try {
    // Load setup.ts first if it exists
    if (info.setupFile) {
      const fileUrl = pathToFileURL(info.setupFile).href;
      try {
        await import(fileUrl);
      } catch (error) {
        throw new Error(`Failed to load setup file ${info.setupFile}: ${(error as Error).message}`);
      }
    }

    // Load test files in this directory
    for (const testFile of info.testFiles) {
      const fileUrl = pathToFileURL(testFile).href;
      try {
        await import(fileUrl);
      } catch (error) {
        throw new Error(`Failed to load test file ${testFile}: ${(error as Error).message}`);
      }
    }

    // Recursively load subdirectories
    for (const subdir of info.subdirs) {
      await loadDirectory(subdir, info.suite, pattern);
    }
  } finally {
    // Pop the directory suite from the stack
    registry.popSuite();
  }

  return info.suite;
}

/**
 * Load test files with directory-level setup support
 * This is the enhanced version that supports setup.ts files
 */
export async function loadTestsWithSetup(
  paths: string[],
  options: LoaderOptions = {}
): Promise<TestSuite[]> {
  const pattern = options.pattern ?? DEFAULT_PATTERN;
  const suites: TestSuite[] = [];

  for (const path of paths) {
    try {
      const stats = await stat(path);

      if (stats.isDirectory()) {
        // Load directory with setup support
        const suite = await loadDirectory(path, null, pattern);
        suites.push(suite);
      } else if (stats.isFile()) {
        // Single file - use traditional loading
        await loadTestFile(path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // If we loaded directories, return those suites
  // Otherwise, return suites from traditional loading
  if (suites.length > 0) {
    return suites;
  }

  const { registry } = await import('../api/test.js');
  return registry.getSuites();
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
