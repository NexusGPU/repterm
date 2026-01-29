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

/**
 * 命令执行结果
 */
export interface CommandResult {
  /** 命令退出码（0 表示成功） */
  code: number;

  /** 标准输出 */
  stdout: string;

  /** 标准错误 */
  stderr: string;

  /** 混合输出（stdout + stderr 合并） */
  output: string;

  /** 命令执行时长（毫秒） */
  duration: number;

  /** 原始命令字符串 */
  command: string;

  /** 是否成功（code === 0） */
  readonly successful: boolean;
}

/**
 * PTY 进程控制器
 * 实现 PromiseLike，既可以作为 Promise 使用（await 自动调用 wait()），也可以作为控制器使用
 */
export interface PTYProcess extends PromiseLike<CommandResult> {
  /** 等待指定文本出现 */
  expect(text: string, options?: { timeout?: number }): Promise<void>;

  /** 发送输入到进程（自动追加换行符） */
  send(input: string): Promise<void>;

  /** 发送原始输入（不追加换行符） */
  sendRaw(input: string): Promise<void>;

  /** 等待命令完成并返回结果 */
  wait(options?: { timeout?: number }): Promise<CommandResult>;

  /** 发送 Ctrl+C */
  interrupt(): Promise<void>;

  /** Promise catch 方法 */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<CommandResult | TResult>;

  /** Promise finally 方法 */
  finally(onfinally?: (() => void) | null): Promise<CommandResult>;
}

/**
 * run() 方法选项
 */
export interface RunOptions {
  /** 命令超时时间（毫秒），默认：30000 */
  timeout?: number;

  /** 环境变量（可选） */
  env?: Record<string, string>;

  /** 工作目录（可选） */
  cwd?: string;
}

export interface TerminalAPI {
  /**
   * 执行命令，返回 PTYProcess（可 await 或使用控制器方法）
   * 
   * 用法：
   * - 非交互式：直接 await，获取 CommandResult
   *   `const result = await terminal.run('echo hello');`
   * 
   * - 交互式：不 await，使用控制器方法
   *   `const proc = terminal.run('vim file.txt');`
   *   `await proc.expect('~');`
   *   `await proc.send(':q');`
   *   `const result = await proc;`
   * 
   * @param command - 要执行的命令
   * @param options - 可选配置
   */
  run(command: string, options?: RunOptions): PTYProcess;

  /** 发送输入到终端 */
  send(text: string): Promise<void>;

  /** 等待指定文本出现 */
  waitForText(text: string, options?: WaitOptions): Promise<void>;

  /** 获取当前终端输出快照 */
  snapshot(): Promise<string>;

  /** 关闭终端 */
  close(): Promise<void>;

  /** 创建新的终端实例（多终端测试） */
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
