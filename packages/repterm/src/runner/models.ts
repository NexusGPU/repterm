/**
 * Core entities for the test framework
 */

export interface TestSuite {
  id: string;
  name: string;
  tests: TestCase[];
  suites?: TestSuite[]; // Nested suites for nested describe() blocks
  parent?: TestSuite; // Parent suite for nested describe() blocks
  config: SuiteConfig;
}

export interface SuiteConfig {
  timeouts?: {
    suiteMs?: number;
    testMs?: number;
  };
  parallel?: {
    workers?: number;
  };
  record?: {
    enabled?: boolean;
    castFile?: string;
  };
}

export interface TestCase {
  id: string;
  name: string;
  steps: Step[];
  timeout?: number;
  fixtures?: Record<string, unknown>;
  fn: TestFunction;
}

export type TestFunction = (context: TestContext) => Promise<void>;

export interface TestContext {
  terminal: TerminalAPI;
  [key: string]: unknown; // Additional fixtures
}

export interface TerminalAPI {
  start(command: string): Promise<void>;
  send(text: string): Promise<void>;
  waitForText(text: string, options?: WaitOptions): Promise<void>;
  snapshot(): Promise<string>;
  close(): Promise<void>;
  create(): Promise<TerminalAPI>;
}

export interface WaitOptions {
  timeout?: number;
}

export interface Step {
  id: string;
  type: 'input' | 'wait' | 'assert' | 'step';
  payload: unknown;
  timeout?: number;
  name?: string; // For test.step()
}

export interface RunResult {
  id: string;
  suiteId: string;
  caseId: string;
  suiteName: string;
  suitePath: string[]; // Path to the suite (e.g. ['Parent', 'Child'])
  caseName: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  error?: TestError;
  artifacts: Artifact[];
  recordingPath?: string;
}

export interface TestError {
  message: string;
  stack?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface Artifact {
  id: string;
  runResultId: string;
  type: 'cast' | 'log' | 'snapshot';
  path: string;
}

/**
 * Run status for API endpoint
 */
export interface RunStatus {
  runId: string;
  status: 'queued' | 'running' | 'passed' | 'failed';
  totals: {
    passed: number;
    failed: number;
    skipped: number;
  };
  durationMs?: number;
  results?: RunResult[];
}
