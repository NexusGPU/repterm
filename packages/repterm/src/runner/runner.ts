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
 * 获取从 suite 继承的 record 配置
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
  const { config, artifactManager, onResult, onTestStart } = options;

  // 确定是否录制：测试级别 > suite 级别
  // 注意：测试已经被过滤，这里只需根据配置确定单个测试的录制状态
  const testRecordConfig = testCase.options?.record ?? getInheritedRecordConfig(suite);
  const shouldRecord = testRecordConfig ?? false;

  // Get recording path for this test
  const recordingPath = shouldRecord
    ? artifactManager.getCastPath(testCase.id)
    : undefined;

  // 在 hooks 运行前通知测试即将开始，确保 suite 名称先于 hook 输出打印
  onTestStart?.({ suitePath, testName: testCase.name });

  // Create terminal for test
  // Use user's actual terminal size (like simple-example.js)
  const terminal = createTerminal({
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    recording: shouldRecord,
    recordingPath,
  });

  // Build initial test context
  let context: TestContext = {
    terminal,
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
