/**
 * Core entities for the test framework
 */

/**
 * Configuration options for test() function
 */
export interface TestOptions {
  /** Mark as recording test, runs only in --record mode */
  record?: boolean;
  /** Test timeout duration (milliseconds) */
  timeout?: number;
  // Future extensions: skip, only, retry, etc.
}

/**
 * Configuration options for describe() function
 */
export interface DescribeOptions {
  /** Mark as recording test suite, all internal tests inherit this configuration by default */
  record?: boolean;
  // Future extensions: timeout, etc.
}

/**
 * Named hook entry for beforeAll/afterAll
 */
export interface NamedHookEntry {
  name?: string;                  // Optional fixture name
  fn: (context: TestContext) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
}

export interface TestSuite {
  id: string;
  name: string;
  tests: TestCase[];
  suites?: TestSuite[]; // Nested suites for nested describe() blocks
  parent?: TestSuite; // Parent suite for nested describe() blocks
  config: SuiteConfig;
  options?: DescribeOptions; // Configuration options for describe()
  beforeAll?: NamedHookEntry[];   // Suite-level setup hooks
  afterAll?: NamedHookEntry[];    // Suite-level teardown hooks
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
  options?: TestOptions; // Configuration options for test()
}

export type TestFunction = (context: TestContext) => Promise<void>;

export interface TestContext {
  terminal: TerminalAPI;
  [key: string]: unknown; // Additional fixtures
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Exit code (0 = success) */
  code: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Combined output (stdout + stderr) */
  output: string;

  /** Command execution duration (milliseconds) */
  duration: number;

  /** Original command string */
  command: string;

  /** Whether successful (code === 0) */
  readonly successful: boolean;
}

/**
 * PTY process controller
 * Implements PromiseLike, can be used both as Promise (await automatically calls wait()) and as controller
 */
export interface PTYProcess extends PromiseLike<CommandResult> {
  /** Wait for specified text to appear */
  expect(text: string, options?: { timeout?: number }): Promise<void>;

  /** Send input to process (automatically appends newline) */
  send(input: string): Promise<void>;

  /** Send raw input (no newline appended) */
  sendRaw(input: string): Promise<void>;

  /** Wait for command to complete and return result */
  wait(options?: { timeout?: number }): Promise<CommandResult>;

  /** Start command execution, wait for input completion (don't wait for command to finish) */
  start(): Promise<void>;

  /** Send Ctrl+C */
  interrupt(): Promise<void>;

  /** Promise catch method */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<CommandResult | TResult>;

  /** Promise finally method */
  finally(onfinally?: (() => void) | null): Promise<CommandResult>;
}

/**
 * run() method options
 */
export interface RunOptions {
  /** Command timeout duration (milliseconds), default: 30000 */
  timeout?: number;

  /** Environment variables (optional) */
  env?: Record<string, string>;

  /** Working directory (optional) */
  cwd?: string;

  /**
   * Mark as interactive command, execute using PTY
   * Interactive mode supports expect/send methods, but exitCode may be unreliable
   */
  interactive?: boolean;

  /**
   * Silent mode: use Bun.spawn even in recording mode
   * For scenarios requiring precise output parsing (e.g., JSON parsing)
   * Note: Commands won't be displayed in recording in this mode
   */
  silent?: boolean;

  /**
   * Recording mode: typing speed (ms/character)
   * Default: 80ms, set to 0 to write directly without typing
   */
  typingSpeed?: number;

  /**
   * Recording mode: pause duration after command execution (ms)
   * Gives viewers time to read the output
   */
  pauseAfter?: number;

  /**
   * Recording mode: pause duration before command execution (ms)
   */
  pauseBefore?: number;
}

/**
 * Plugin factory type - creates plugin instances for new terminals
 */
export type PluginFactory<TPlugins extends Record<string, unknown> = Record<string, unknown>> = (
  terminal: TerminalAPI
) => TPlugins;

/**
 * Terminal interface with plugins
 */
export interface TerminalWithPlugins<TPlugins extends Record<string, unknown> = Record<string, unknown>> extends TerminalAPI {
  /** Plugin instance (same configuration as main terminal) */
  plugins: TPlugins;
}

export interface TerminalAPI {
  /**
   * Execute command, returns PTYProcess (can await or use controller methods)
   *
   * Usage:
   * - Non-interactive: directly await, get CommandResult
   *   `const result = await terminal.run('echo hello');`
   *
   * - Interactive: don't await, use controller methods
   *   `const proc = terminal.run('vim file.txt');`
   *   `await proc.expect('~');`
   *   `await proc.send(':q');`
   *   `const result = await proc;`
   *
   * @param command - Command to execute
   * @param options - Optional configuration
   */
  run(command: string, options?: RunOptions): PTYProcess;

  /** Send input to terminal */
  send(text: string): Promise<void>;

  /** Wait for specified text to appear */
  waitForText(text: string, options?: WaitOptions): Promise<void>;

  /** Get current terminal output snapshot */
  snapshot(): Promise<string>;

  /** Close terminal */
  close(): Promise<void>;

  /**
   * Create new terminal instance (multi-terminal testing)
   * If plugin factory is set, returned terminal automatically includes plugins property
   */
  create<TPlugins extends Record<string, unknown> = Record<string, unknown>>(): Promise<TerminalWithPlugins<TPlugins>>;

  /** Check if in recording mode */
  isRecording?(): boolean;

  /** Check if in PTY mode (includes recording mode and ptyOnly mode) */
  isPtyMode?(): boolean;

  /**
   * Set plugin factory (for auto-injection into create())
   * @internal Called by plugin system
   */
  setPluginFactory?<TPlugins extends Record<string, unknown>>(factory: PluginFactory<TPlugins>): void;
}

export interface WaitOptions {
  timeout?: number;
  /**
   * Whether to remove ANSI escape sequences before matching text (default true in recording mode)
   * Set to false to preserve raw output for testing ANSI-related features
   */
  stripAnsi?: boolean;
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

export interface CommandLog {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  output: string;
  duration: number;
}

export interface TestError {
  message: string;
  stack?: string;
  expected?: unknown;
  actual?: unknown;
  commandLogs?: CommandLog[];
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
