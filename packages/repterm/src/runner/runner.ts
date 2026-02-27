/**
 * Single-runner execution pipeline
 * Executes test suites and cases, manages lifecycle with onion execution model
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
  onTestStart?: (testInfo: { suitePath: string[]; testName: string }) => void;
}

/**
 * Extract parameter names from a test function
 * Parses destructured parameters like ({ terminal, tmpDir }) => ...
 */
function getTestFunctionParameters(fn: (context: TestContext) => Promise<void>): string[] {
  const fnStr = fn.toString();
  // Match destructured object parameter: ({ param1, param2, ... })
  const match = fnStr.match(/\(\s*\{\s*([^}]*)\s*\}/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((p) => {
      // Handle cases like "param: Type" or "param = default" or just "param"
      const trimmed = p.trim();
      const paramName = trimmed.split(/[:\s=]/)[0].trim();
      return paramName;
    })
    .filter(Boolean);
}

/**
 * Execute tests in a suite (without lifecycle hooks)
 * This is the internal function for running tests only
 */
async function runTestsInSuite(
  suite: TestSuite,
  options: RunnerOptions,
  inheritedContext: Record<string, unknown> = {}
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  for (const testCase of suite.tests) {
    const result = await runTest(testCase, suite, options, inheritedContext);
    results.push(result);
  }

  return results;
}

/**
 * Execute a single test suite with lifecycle hooks (onion model)
 *
 * Execution order:
 * 1. Run beforeAll hooks for this suite
 * 2. Merge beforeAll context with inherited context
 * 3. Run tests in this suite
 * 4. Recursively run child suites
 * 5. Run afterAll hooks for this suite
 */
export async function runSuite(
  suite: TestSuite,
  options: RunnerOptions,
  inheritedContext: Record<string, unknown> = {}
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  let suiteContext = { ...inheritedContext };

  // Create a basic terminal for beforeAll/afterAll hooks (never recording, never pty-only)
  const hookTerminal = createTerminal({
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    recording: false,
    ptyOnly: false,
    promptLineCount: options.config.terminal?.promptLineCount,
    shellIntegration: options.config.terminal?.shellIntegration,
  });

  try {
    // 1. Run beforeAll hooks for this suite (hook terminal always available)
    const hookContext = { ...inheritedContext, terminal: hookTerminal, $: hookTerminal.$ };
    suiteContext = await hooksRegistry.runBeforeAllFor(suite, hookContext);

    // 2. Run tests in this suite with the merged context
    const testResults = await runTestsInSuite(suite, options, suiteContext);
    results.push(...testResults);

    // 3. Recursively run child suites with the merged context
    if (suite.suites && suite.suites.length > 0) {
      for (const childSuite of suite.suites) {
        const childResults = await runSuite(childSuite, options, suiteContext);
        results.push(...childResults);
      }
    }
  } finally {
    // 4. Run afterAll hooks for this suite (always, even if tests failed)
    try {
      const afterAllContext = { ...suiteContext, terminal: hookTerminal, $: hookTerminal.$ };
      await hooksRegistry.runAfterAllFor(suite, afterAllContext);
    } catch (hookError) {
      console.error(`Error in afterAll hook for suite "${suite.name}":`, hookError);
    }

    // 5. Close the hook terminal
    try {
      await hookTerminal.close();
    } catch {
      // ignore close errors
    }
  }

  return results;
}

/**
 * Get record config inherited from suite
 */
function getInheritedRecordConfig(suite: TestSuite): boolean | undefined {
  if (suite.options?.record !== undefined) {
    return suite.options.record;
  }
  if (suite.parent) {
    return getInheritedRecordConfig(suite.parent);
  }
  return undefined;
}

/**
 * Execute a single test case
 */
export async function runTest(
  testCase: TestCase,
  suite: TestSuite,
  options: RunnerOptions,
  inheritedContext: Record<string, unknown> = {}
): Promise<RunResult> {
  // Build suite path
  const suitePath: string[] = [suite.name];
  let parent = suite.parent;
  while (parent && parent.id !== 'default' && !parent.id.startsWith('file-') && !parent.id.startsWith('dir-')) {
    suitePath.unshift(parent.name);
    parent = parent.parent;
  }

  const startTime = Date.now();
  const { config, artifactManager, onResult, onTestStart } = options;

  // Execution mode:
  // 1. testRecordConfig: test- or suite-level record
  // 2. cliRecordMode: CLI --record
  // 3. shouldRecord: full recording (asciinema + tmux + typing) only when both CLI and test enable it
  // 4. shouldUsePtyOnly: test has record but CLI does not -> PTY-only (no recording, no typing)
  const testRecordConfig = testCase.options?.record ?? getInheritedRecordConfig(suite);
  const cliRecordMode = config.record?.enabled ?? false;
  const shouldRecord = cliRecordMode && testRecordConfig;  // Full recording
  const shouldUsePtyOnly = testRecordConfig && !cliRecordMode;  // PTY-only

  // Get recording path for this test (only in recording mode)
  const recordingPath = shouldRecord
    ? artifactManager.getCastPath(testCase.id)
    : undefined;

  // Notify before hooks so suite name prints before hook output
  onTestStart?.({ suitePath, testName: testCase.name });

  // Create terminal for test
  // Use user's actual terminal size (like simple-example.js)
  const terminal = createTerminal({
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    recording: shouldRecord,
    ptyOnly: shouldUsePtyOnly,
    recordingPath,
    promptLineCount: config.terminal?.promptLineCount,
    shellIntegration: config.terminal?.shellIntegration,
  });

  // Build initial test context with inherited context from beforeAll hooks
  // terminal and $ are placed after inheritedContext so the test's own terminal always wins
  let context: TestContext = {
    ...inheritedContext,
    terminal,
    $: terminal.$,
    ...testCase.fixtures,
  };

  // Track which fixtures were actually executed (for cleanup)
  let executedFixtures = new Set<string>();

  try {
    // Extract required fixtures from test function parameters
    const requiredFixtures = new Set(getTestFunctionParameters(testCase.fn));

    // Run beforeEach hooks only for requested fixtures (lazy execution)
    const hookResult = await hooksRegistry.runBeforeEachFor(context, suite, requiredFixtures);
    context = hookResult.context;
    executedFixtures = hookResult.executedFixtures;

    // Set timeout
    const timeout = testCase.timeout ?? config.timeouts.testMs;
    await Promise.race([
      testCase.fn(context),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
      ),
    ]);

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
        commandLogs: terminal.getCommandLogs(),
      },
      artifacts: [],
      recordingPath,
    };

    onResult?.(result);
    return result;
  } finally {
    // Cleanup
    clearSteps();

    // Run afterEach hooks only for fixtures that were actually executed
    try {
      await hooksRegistry.runAfterEachFor(context, suite, executedFixtures);
    } catch (hookError) {
      console.error('Error in afterEach hook:', hookError);
    }

    // Cleanup terminal
    await terminal.close();
  }
}

/**
 * Execute all test suites with lifecycle hooks
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
