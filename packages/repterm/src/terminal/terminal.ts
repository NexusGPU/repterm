/**
 * Terminal API implementation
 * Provides high-level terminal interaction (start/send/wait/snapshot)
 * 
 * 统一执行架构：所有命令通过 PTY + launcher 执行，确保行为一致性
 */

import type { TerminalAPI, WaitOptions, CommandResult, RunOptions, PTYProcess } from '../runner/models.js';
import { TerminalSession } from './session.js';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the CLI directory path for launcher command
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_INDEX_PATH = join(__dirname, '..', 'cli', 'index.js');

/**
 * CommandResult 实现类，提供 successful getter
 */
class CommandResultImpl implements CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  output: string;
  duration: number;
  command: string;

  constructor(data: {
    code: number;
    stdout: string;
    stderr: string;
    output: string;
    duration: number;
    command: string;
  }) {
    this.code = data.code;
    this.stdout = data.stdout;
    this.stderr = data.stderr;
    this.output = data.output;
    this.duration = data.duration;
    this.command = data.command;
  }

  get successful(): boolean {
    return this.code === 0;
  }
}

export interface TerminalConfig {
  cols?: number;
  rows?: number;
  recording?: boolean;
  recordingPath?: string;
  tmuxSessionName?: string;  // For multi-window recording
  tmuxPaneId?: string;  // For split panes
}

// Shared state for tracking pane count across Terminal and TerminalFactory
export interface SharedTerminalState {
  paneCount: number;
  currentActivePane?: number;  // Track which pane is currently active
}

/**
 * High-level Terminal API for test authoring
 */
export class Terminal extends EventEmitter implements TerminalAPI {
  private session: TerminalSession;
  private recording: boolean;
  private recordingPath?: string;
  private closed = false;
  private initialized = false;
  private tmuxSessionName?: string;
  private tmuxPaneId?: string;
  private sharedState: SharedTerminalState;
  private paneIndex?: number;  // Index of the tmux pane this terminal is bound to

  constructor(config: TerminalConfig = {}) {
    super();
    this.recording = config.recording ?? false;
    this.recordingPath = config.recordingPath;
    this.tmuxSessionName = config.tmuxSessionName;
    this.tmuxPaneId = config.tmuxPaneId;
    this.sharedState = { paneCount: 1 };  // Start with 1 pane (the main pane)
    this.paneIndex = 0;  // Main terminal is pane 0

    // Create session - in recording mode, spawn asciinema; otherwise spawn shell
    this.session = new TerminalSession({
      cols: config.cols,
      rows: config.rows,
    });
  }

  /**
   * Get tmux session name (for multi-terminal coordination)
   */
  getTmuxSessionName(): string | undefined {
    return this.tmuxSessionName;
  }

  /**
   * Get tmux pane ID (for multi-terminal coordination)
   */
  getTmuxPaneId(): string | undefined {
    return this.tmuxPaneId;
  }

  /**
   * Get terminal session (for direct access)
   */
  getSession(): TerminalSession {
    return this.session;
  }

  /**
   * Get shared state (for factory to update pane count)
   */
  getSharedState(): SharedTerminalState {
    return this.sharedState;
  }

  /**
   * Increment pane count (called by factory when creating new panes)
   */
  incrementPaneCount(): void {
    this.sharedState.paneCount++;
  }

  /**
   * Set parent session (for child terminals that share a session)
   */
  setParentSession(session: TerminalSession, sharedState: SharedTerminalState, paneIndex: number): void {
    this.session = session;
    this.sharedState = sharedState;
    this.paneIndex = paneIndex;
    this.initialized = true;  // Already initialized via parent
  }

  /**
   * Select the tmux pane that this terminal is bound to
   * Uses arrow key navigation to switch panes without showing pane IDs
   */
  private async selectPane(): Promise<void> {
    if (this.paneIndex === undefined || !this.recording) return;

    // Track current active pane in shared state
    const currentActive = this.sharedState.currentActivePane ?? 0;
    if (currentActive === this.paneIndex) {
      return;  // Already on the correct pane
    }

    // Calculate how many panes to navigate
    // First split is horizontal (up/down), second is vertical (left/right), etc.
    // For simplicity, use Ctrl+B o to cycle through panes
    const panesToCycle = (this.paneIndex - currentActive + this.sharedState.paneCount) % this.sharedState.paneCount;

    for (let i = 0; i < panesToCycle; i++) {
      this.session.write('\x02');  // Ctrl+B (tmux prefix)
      await this.sleep(50);
      this.session.write('o');     // Cycle to next pane
      await this.sleep(150);
    }

    // Update current active pane
    this.sharedState.currentActivePane = this.paneIndex;
  }

  /**
   * 执行命令，返回 PTYProcess
   * 
   * 统一执行架构：所有命令通过 PTY + launcher 执行
   * - 直接 await: 自动调用 wait()，返回 CommandResult
   * - 不 await: 返回 PTYProcess 控制器，可调用 expect/send/wait 等方法
   */
  run(command: string, options: RunOptions = {}): PTYProcess {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }
    return new PTYProcessImpl(this, command, options);
  }

  /**
   * Initialize terminal session (recording or non-recording)
   */
  private async initializeSession(): Promise<void> {
    if (this.initialized) return;

    if (this.recording && this.recordingPath) {
      // 生成 tmux session 名称
      const sessionName = `repterm-${Date.now().toString(36)}`;
      this.tmuxSessionName = sessionName;

      // Recording mode: 使用 asciinema --command 直接启动 tmux
      this.session.start({
        shell: 'asciinema',
        args: ['rec', '--command', `tmux new -s ${sessionName}`, this.recordingPath, '--overwrite'],
      });

      // 等待 tmux 启动就绪
      await this.waitForTmuxReady();

    } else if (this.tmuxPaneId) {
      // This is a split pane, don't initialize a new session
      // Commands will be sent through the main terminal
      this.initialized = true;
      return;
    } else {
      // Non-recording mode: spawn shell directly
      this.session.start();
      // Wait for shell to initialize and be ready
      await this.waitForShellReady();
    }

    this.initialized = true;
  }

  /**
   * Wait for shell to be ready (detect shell prompt)
   */
  private async waitForShellReady(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const output = this.session.getOutput();
      // 检测 shell 准备好的标志（出现命令提示符）
      if (output.includes('$') || output.includes('#') || output.includes('%') || output.includes('>')) {
        await this.sleep(100);  // 额外等待确保稳定
        return;
      }
      await this.sleep(50);
    }
    // 超时不报错，继续执行
  }

  /**
   * Wait for tmux to be ready (detect shell prompt)
   */
  private async waitForTmuxReady(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const output = this.session.getOutput();
      // 检测 tmux 启动完成的标志（通常是出现命令提示符）
      if (output.includes('$') || output.includes('#') || output.includes('%')) {
        await this.sleep(300);  // 额外等待确保稳定
        return;
      }
      await this.sleep(100);
    }
    // 超时不报错，继续执行
  }

  /**
   * Send text to the terminal
   */
  async send(text: string): Promise<void> {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }

    if (!this.session.isActive()) {
      throw new Error('Terminal not started');
    }

    // In recording mode, simulate human typing
    if (this.recording) {
      await this.typeWithDelay(text);
    } else {
      this.session.write(text);
    }
  }

  /**
   * Wait for text to appear in terminal output
   */
  async waitForText(text: string, options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout ?? 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const output = this.session.getOutput();
      if (output.includes(text)) {
        return;
      }
      await this.sleep(100);
    }

    throw new Error(`Timeout waiting for text "${text}" after ${timeout}ms`);
  }

  /**
   * Get snapshot of current terminal output
   */
  async snapshot(): Promise<string> {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }

    return this.session.getOutput();
  }

  /**
   * Create a new terminal instance (for multi-terminal tests)
   * - Recording mode: splits tmux window (tmux already started via asciinema --command)
   * - Non-recording mode: creates independent terminal
   */
  async create(): Promise<Terminal> {
    if (this.recording && this.tmuxSessionName) {
      // 录制模式：使用快捷键 Ctrl+B split 窗口
      // 分割策略（九宫格效果）：
      // - 当前1个窗口 -> 第2个窗口：水平分割（上下）使用 "
      // - 当前2个窗口 -> 第3个窗口：垂直分割（左右）使用 %
      // - 以此类推：奇数个窗口时水平分割，偶数个窗口时垂直分割
      const currentPaneCount = this.sharedState.paneCount;
      const splitKey = currentPaneCount % 2 === 1 ? '"' : '%';  // 奇数水平分割，偶数垂直分割

      this.session.write('\x02');  // Ctrl+B
      await this.sleep(100);
      this.session.write(splitKey);
      await this.sleep(800);      // 等待新 pane 初始化

      const newPaneIndex = this.sharedState.paneCount;
      this.sharedState.paneCount++;
      this.sharedState.currentActivePane = newPaneIndex;  // New pane is now active after split

      // Create a new Terminal bound to the new pane
      const newTerminal = new Terminal({
        recording: true,
        tmuxSessionName: this.tmuxSessionName,
      });
      newTerminal.setParentSession(this.session, this.sharedState, newPaneIndex);
      return newTerminal;
    }

    // 非录制模式：创建独立终端
    const newTerminal = new Terminal({ recording: false });
    return newTerminal;
  }

  /**
   * Close the terminal
   */
  async close(): Promise<void> {
    if (!this.closed) {
      const tmuxSessionToClean = this.tmuxSessionName;  // 保存 session 名称

      if (this.recording && this.tmuxSessionName && this.session.isActive()) {
        // 使用快捷键 Ctrl+B d 分离 tmux（detach）
        // 这会导致 tmux 退出，从而结束 asciinema 录制
        await this.sleep(300);
        this.session.write('\x02');  // Ctrl+B (tmux prefix)
        await this.sleep(100);
        this.session.write('d');     // detach
        await this.sleep(500);       // 等待 asciinema 结束录制

      } else if (this.recording && this.session.isActive()) {
        // Recording without tmux - send Ctrl+D to end asciinema recording
        this.session.write('\x04');  // Ctrl+D
        await this.sleep(500);
      }

      // Use SIGTERM signal to kill the process
      this.session.kill('SIGTERM');
      this.closed = true;
      this.emit('close');

      // 录制结束后，清理 tmux session（在录制外执行）
      if (tmuxSessionToClean) {
        await this.cleanupTmuxSession(tmuxSessionToClean);
      }
    }
  }

  /**
   * Clean up tmux session after recording ends
   */
  private async cleanupTmuxSession(sessionName: string): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
    } catch {
      // Ignore errors - session may already be terminated
    }
  }

  /**
   * Check if terminal is active
   */
  isActive(): boolean {
    return this.session.isActive() && !this.closed;
  }

  /**
   * Type text with human-like delays (for recording mode)
   * Following simple-example.js pattern: 80ms base delay with ±30% randomization
   */
  private async typeWithDelay(text: string): Promise<void> {
    const baseDelay = 80; // ms per character (from simple-example.js)

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      this.session.write(char);

      // Randomize delay: baseDelay ± 30% (56ms to 104ms)
      const randomDelay = baseDelay + (Math.random() - 0.5) * baseDelay * 0.6;
      await this.sleep(randomDelay);

      // For quotes, add extra delay to let shell process them properly
      // This helps prevent output buffering issues
      if (char === '"' || char === "'") {
        await this.sleep(50);
      }
    }
  }

  /**
   * Wait for output to stabilize (from simple-example.js)
   * Waits for new output to appear, then waits for it to stop changing
   */
  private async waitForOutputStable(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    const startLength = this.session.getOutput().length;
    let hasNewOutput = false;
    let lastLength = startLength;
    let stableCount = 0;
    const requiredStableChecks = 3; // Need 3 consecutive stable checks
    const checkInterval = 100; // Check every 100ms

    while (Date.now() - startTime < timeout) {
      await this.sleep(checkInterval);

      const currentLength = this.session.getOutput().length;
      const newBytes = currentLength - startLength;

      // Check if there's new output (at least 10 bytes to avoid just control chars)
      if (newBytes > 10) {
        hasNewOutput = true;
      }

      // Check if output is stable (length not changing)
      if (currentLength === lastLength) {
        stableCount++;

        // If we have new output and it's been stable for required checks, we're done
        if (hasNewOutput && stableCount >= requiredStableChecks) {
          return;
        }
      } else {
        // New data arrived, reset stable count
        stableCount = 0;
        lastLength = currentLength;
      }
    }

    // Timeout is not an error in recording mode - just continue
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Read launcher result from temp files
   */
  async readLauncherResult(id: string, command: string, startTime: number): Promise<CommandResult> {
    const stdoutPath = `/tmp/repterm-${id}.stdout`;
    const stderrPath = `/tmp/repterm-${id}.stderr`;
    const exitPath = `/tmp/repterm-${id}.exit`;

    // Read results with fallbacks
    const [stdout, stderr, exitStr] = await Promise.all([
      Bun.file(stdoutPath).text().catch(() => ''),
      Bun.file(stderrPath).text().catch(() => ''),
      Bun.file(exitPath).text().catch(() => '-1'),
    ]);

    // Cleanup temp files
    const { unlink } = await import('fs/promises');
    await Promise.all([
      unlink(stdoutPath).catch(() => { }),
      unlink(stderrPath).catch(() => { }),
      unlink(exitPath).catch(() => { }),
    ]);

    const exitCode = parseInt(exitStr.trim(), 10);
    return new CommandResultImpl({
      code: Number.isNaN(exitCode) ? -1 : exitCode,
      stdout,
      stderr,
      output: stdout + stderr,
      duration: Date.now() - startTime,
      command,
    });
  }

  /**
   * Execute command in PTY (internal, for PTYProcessImpl)
   */
  async executeInPty(command: string): Promise<void> {
    // Initialize session on first command
    if (!this.session.isActive()) {
      await this.initializeSession();
    }

    // In recording mode, type with human-like delay
    if (this.recording) {
      await this.selectPane();
      await this.sleep(300);

      const shouldPaste = command.length > 50 || command.includes('\n');
      if (shouldPaste) {
        this.session.write(command);
        await this.sleep(100);
      } else {
        await this.typeWithDelay(command);
      }
      this.session.write('\r');
    } else {
      this.session.write(command + '\n');
    }

    await this.sleep(50);
  }
}

/**
 * PTYProcess 实现类
 * 实现 PromiseLike 接口，支持 await 和控制器两种用法
 */
class PTYProcessImpl implements PTYProcess {
  private terminal: Terminal;
  private launcherId: string;
  private commandStarted: boolean = false;
  private command: string;
  private options: RunOptions;
  private startTime: number;

  constructor(terminal: Terminal, command: string, options: RunOptions = {}) {
    this.terminal = terminal;
    this.launcherId = crypto.randomUUID();
    this.command = command;
    this.options = options;
    this.startTime = Date.now();
  }

  // ===== PromiseLike 实现 =====

  /**
   * 实现 PromiseLike.then()
   * await proc 时自动调用此方法
   */
  then<TResult1 = CommandResult, TResult2 = never>(
    onfulfilled?: ((value: CommandResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.wait().then(onfulfilled, onrejected);
  }

  /**
   * 实现 catch 方法（便捷方法）
   */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<CommandResult | TResult> {
    return this.wait().catch(onrejected);
  }

  /**
   * 实现 finally 方法（便捷方法）
   */
  finally(onfinally?: (() => void) | null): Promise<CommandResult> {
    return this.wait().finally(onfinally);
  }

  // ===== 交互式控制方法 =====

  /**
   * Start the command with launcher wrapper
   */
  private async startCommand(): Promise<void> {
    if (this.commandStarted) return;
    this.commandStarted = true;

    // Escape single quotes in the command and wrap with single quotes
    // This ensures shell special characters (;, |, &, etc.) are passed to launcher
    const escapedCommand = this.command.replace(/'/g, "'\\''");
    const launcherCmd = `bun ${CLI_INDEX_PATH} __launcher__ --id=${this.launcherId} -- '${escapedCommand}'`;
    await this.terminal.executeInPty(launcherCmd);
  }

  /**
   * Wait for specified text to appear
   */
  async expect(text: string, options?: { timeout?: number }): Promise<void> {
    await this.startCommand();
    await this.terminal.waitForText(text, options);
  }

  /**
   * Send input to the process (with newline)
   */
  async send(input: string): Promise<void> {
    await this.startCommand();
    await this.terminal.send(input + '\r');
  }

  /**
   * Send raw input to the process (without newline)
   */
  async sendRaw(input: string): Promise<void> {
    await this.startCommand();
    await this.terminal.send(input);
  }

  /**
   * Wait for command to complete and return result
   */
  async wait(options?: { timeout?: number }): Promise<CommandResult> {
    await this.startCommand();

    // Wait for output to stabilize
    const timeout = options?.timeout ?? this.options.timeout ?? 30000;
    const waitStartTime = Date.now();

    // Poll for exit file to exist
    const exitPath = `/tmp/repterm-${this.launcherId}.exit`;
    while (Date.now() - waitStartTime < timeout) {
      const exitFile = Bun.file(exitPath);
      if (await exitFile.exists()) {
        // Give a small delay for files to be fully written
        await new Promise(resolve => setTimeout(resolve, 100));
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return this.terminal.readLauncherResult(this.launcherId, this.command, this.startTime);
  }

  /**
   * Send Ctrl+C to interrupt the command
   */
  async interrupt(): Promise<void> {
    await this.terminal.send('\x03');  // Ctrl+C
  }
}

/**
 * Create a new Terminal instance
 */
export function createTerminal(config?: TerminalConfig): Terminal {
  return new Terminal(config);
}
