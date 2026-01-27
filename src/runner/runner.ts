/**
 * Single-runner execution pipeline
 * Executes test suites and cases, manages lifecycle
 */

import type { TestSuite, TestCase, RunResult, TestContext } from './models.js';
import { createTerminal } from '../terminal/terminal.js';
import { ArtifactManager } from './artifacts.js';
import type { RunConfig } from './config.js';
import { hooksRegistry } from '../api/hooks.js';
import { clearSteps } from '../api/steps.js';

export interface RunnerOptions {
  config: RunConfig;
  artifactManager: ArtifactManager;
  onResult?: (result: RunResult) => void;
}

/**
 * Execute a single test suite
 */
export async function runSuite(
  suite: TestSuite,
  options: RunnerOptions
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  for (const testCase of suite.tests) {
    const result = await runTest(testCase, suite, options);
    results.push(result);
  }

  return results;
}

/**
 * Execute a single test case
 */
export async function runTest(
  testCase: TestCase,
  suite: TestSuite,
  options: RunnerOptions
): Promise<RunResult> {
  // Build suite path
  const suitePath: string[] = [suite.name];
  let parent = suite.parent;
  while (parent && parent.id !== 'default' && !parent.id.startsWith('file-')) {
    suitePath.unshift(parent.name);
    parent = parent.parent;
  }

  const startTime = Date.now();
  const { config, artifactManager, onResult } = options;

  // Get recording path for this test
  const recordingPath = config.record.enabled
    ? artifactManager.getCastPath(testCase.id)
    : undefined;

  // Create terminal for test
  // Use user's actual terminal size (like simple-example.js)
  const terminal = createTerminal({
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    recording: config.record.enabled,
    recordingPath,
  });

  // Build test context with fixtures
  const context: TestContext = {
    terminal,
    ...testCase.fixtures,
  };

  // Build and merge additional fixtures from registry
  const additionalFixtures = hooksRegistry.buildFixtures(context);
  Object.assign(context, additionalFixtures);

  try {
    // Run beforeEach hooks
    await hooksRegistry.runBeforeEach(context);

    // Set timeout
    const timeout = testCase.timeout ?? config.timeouts.testMs;
    await Promise.race([
      testCase.fn(context),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
      ),
    ]);

    // Run afterEach hooks
    await hooksRegistry.runAfterEach(context);

    // Test passed
    const durationMs = Date.now() - startTime;

    const result: RunResult = {
      id: `result-${testCase.id}`,
      suiteId: suite.id,
      caseId: testCase.id,
      suiteName: suite.name,
      suitePath,
      caseName: testCase.name,
      status: 'pass',
      durationMs,
      artifacts: [],
      recordingPath,
    };

    onResult?.(result);
    return result;
  } catch (error) {
    // Test failed
    const durationMs = Date.now() - startTime;

    const result: RunResult = {
      id: `result-${testCase.id}`,
      suiteId: suite.id,
      caseId: testCase.id,
      suiteName: suite.name,
      suitePath,
      caseName: testCase.name,
      status: 'fail',
      durationMs,
      error: {
        message: (error as Error).message,
        stack: (error as Error).stack,
        expected: (error as { expected?: unknown }).expected,
        actual: (error as { actual?: unknown }).actual,
      },
      artifacts: [],
      recordingPath,
    };

    onResult?.(result);
    return result;
  } finally {
    // Cleanup
    clearSteps();

    // Run afterEach hooks even on failure
    try {
      await hooksRegistry.runAfterEach(context);
    } catch (hookError) {
      console.error('Error in afterEach hook:', hookError);
    }

    // Cleanup terminal
    await terminal.close();
  }
}

/**
 * Execute all test suites
 */
export async function runAllSuites(
  suites: TestSuite[],
  options: RunnerOptions
): Promise<RunResult[]> {
  const allResults: RunResult[] = [];

  for (const suite of suites) {
    const results = await runSuite(suite, options);
    allResults.push(...results);
  }

  return allResults;
}
