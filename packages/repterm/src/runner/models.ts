/**
 * Core entities for the test framework
 */

/**
 * test() 函数的配置选项
 */
export interface TestOptions {
  /** 标记为录制测试，仅在 --record 模式下运行 */
  record?: boolean;
  /** 测试超时时间（毫秒） */
  timeout?: number;
  // 未来可扩展：skip, only, retry 等
}

/**
 * describe() 函数的配置选项
 */
export interface DescribeOptions {
  /** 标记为录制测试套件，内部所有测试默认继承此配置 */
  record?: boolean;
  // 未来可扩展：timeout 等
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
  options?: DescribeOptions; // describe() 的配置选项
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
  options?: TestOptions; // test() 的配置选项
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

  /** 启动命令执行，等待输入完成（不等待命令执行完成） */
  start(): Promise<void>;

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

  /** 
   * 标记为交互式命令，使用 PTY 执行
   * 交互式模式支持 expect/send 方法，但 exitCode 不可靠
   */
  interactive?: boolean;

  /**
   * 静默模式：即使在录制模式下也使用 Bun.spawn 执行
   * 用于需要精确解析输出的场景（如 JSON 解析）
   * 注意：此模式下命令不会在录制中显示
   */
  silent?: boolean;

  /**
   * 录制模式：打字速度 (ms/字符)
   * 默认值：80ms，设为 0 则直接写入不打字
   */
  typingSpeed?: number;

  /**
   * 录制模式：命令执行后暂停时间 (ms)
   * 用于让观众有时间阅读输出
   */
  pauseAfter?: number;

  /**
   * 录制模式：命令执行前暂停时间 (ms)
   */
  pauseBefore?: number;
}

/**
 * 插件工厂类型 - 用于为新终端创建插件实例
 */
export type PluginFactory<TPlugins = Record<string, unknown>> = (
  terminal: TerminalAPI
) => TPlugins;

/**
 * 带插件的终端接口
 */
export interface TerminalWithPlugins<TPlugins = Record<string, unknown>> extends TerminalAPI {
  /** 插件实例（与主终端相同配置） */
  plugins: TPlugins;
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

  /** 
   * 创建新的终端实例（多终端测试）
   * 如果设置了插件工厂，返回的终端会自动携带 plugins 属性
   */
  create<TPlugins = Record<string, unknown>>(): Promise<TerminalWithPlugins<TPlugins>>;

  /** 检查是否处于录制模式 */
  isRecording?(): boolean;

  /** 检查是否处于 PTY 模式（包括录制模式和 ptyOnly 模式） */
  isPtyMode?(): boolean;

  /** 
   * 设置插件工厂（用于 create() 自动注入插件）
   * @internal 由插件系统调用
   */
  setPluginFactory?<TPlugins>(factory: PluginFactory<TPlugins>): void;
}

export interface WaitOptions {
  timeout?: number;
  /** 
   * 是否移除 ANSI 转义序列后再匹配文本（录制模式下默认 true）
   * 设为 false 可保留原始输出，用于测试 ANSI 相关功能
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
