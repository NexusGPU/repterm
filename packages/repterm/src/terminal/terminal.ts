/**
 * Terminal API implementation
 * Provides high-level terminal interaction (start/send/wait/snapshot)
 * 
 * 执行架构：
 * - 非录制、非交互模式：使用 Bun.spawn，stdout/stderr 分离，exitCode 精确
 * - 录制或交互模式：使用 PTY，支持复杂交互，但 exitCode 不可靠
 */

import type { TerminalAPI, WaitOptions, CommandResult, RunOptions, PTYProcess, PluginFactory, TerminalWithPlugins, CommandLog } from '../runner/models.js';
import { TerminalSession } from './session.js';
import { EventEmitter } from 'events';
import { getCurrentStepOptions, getCurrentStepName, shouldShowStepTitle, markStepTitleShown } from '../api/steps.js';

/**
 * 计算 tmux 输出捕获的行范围
 * 纯函数，可独立单元测试
 */
export function calculateOutputRange(
  beforeCursorY: number,
  beforeHistorySize: number,
  afterCursorY: number,
  afterHistorySize: number,
  promptLineCount: number,
): { startLine: number; endLine: number } {
  const historyGrowth = afterHistorySize - beforeHistorySize;
  const startLine = beforeCursorY + 1 - historyGrowth;
  const endLine = afterCursorY - promptLineCount;
  return { startLine, endLine };
}

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
  recording?: boolean;      // 启用录制（asciinema + tmux + 打字效果）
  recordingPath?: string;
  ptyOnly?: boolean;        // PTY-only 模式（使用 PTY 但无录制、无打字效果）
  tmuxSessionName?: string;  // For multi-window recording
  tmuxPaneId?: string;  // For split panes
  promptLineCount?: number;  // 强制指定提示符行数，跳过自动检测
}

// Shared state for tracking pane count across Terminal and TerminalFactory
export interface SharedTerminalState {
  paneCount: number;
  currentActivePane?: number;  // Track which pane is currently active
  paneOutputs: Map<number, string>;  // Per-pane output buffers for isolation
}

/**
 * High-level Terminal API for test authoring
 */
export class Terminal extends EventEmitter implements TerminalAPI {
  private session: TerminalSession;
  private recording: boolean;
  private ptyOnly: boolean;  // PTY-only 模式标志
  private recordingPath?: string;
  private closed = false;
  private initialized = false;
  private tmuxSessionName?: string;
  private tmuxPaneId?: string;
  private sharedState: SharedTerminalState;
  private paneIndex?: number;  // Index of the tmux pane this terminal is bound to
  private nonInteractiveOutput: string = '';  // 存储非交互模式下的命令输出
  private commandLogs: CommandLog[] = [];      // 存储测试期间执行过的命令
  private pluginFactory?: PluginFactory<any>;  // 插件工厂
  public plugins?: Record<string, unknown>;  // 插件实例（为新终端设置）

  // 发送 Enter 前的状态（用于输出范围捕获）
  private beforeEnterHistorySize: number = 0;
  private beforeEnterCursorY: number = 0;
  // 命令的实际行数（直接从命令内容计算，最可靠）
  private commandLineCount: number = 0;
  // 检测到的提示符行数（默认 0，由自动检测或用户配置设置）
  private promptLineCount: number = 0;
  // 是否使用用户配置的值（跳过自动检测）
  private promptLineCountConfigured: boolean = false;
  // 检测到的提示符匹配 pattern
  private detectedPromptPattern?: RegExp;

  constructor(config: TerminalConfig = {}) {
    super();
    this.recording = config.recording ?? false;
    this.ptyOnly = config.ptyOnly ?? false;
    this.recordingPath = config.recordingPath;
    this.tmuxSessionName = config.tmuxSessionName;
    this.tmuxPaneId = config.tmuxPaneId;
    this.sharedState = { paneCount: 1, paneOutputs: new Map() };  // Start with 1 pane
    this.paneIndex = 0;  // Main terminal is pane 0
    this.nonInteractiveOutput = '';

    // 如果用户配置了 promptLineCount，直接使用，不进行自动检测
    if (config.promptLineCount !== undefined) {
      this.promptLineCount = config.promptLineCount;
      this.promptLineCountConfigured = true;
    }

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
   * 执行模式：
   * - 非录制、非交互（默认）：使用 Bun.spawn，stdout/stderr 分离，exitCode 精确
   * - 录制或交互：使用 PTY，支持 expect/send，但 exitCode 返回 -1
   * 
   * 用法：
   * - 直接 await: 自动调用 wait()，返回 CommandResult
   * - 不 await: 返回 PTYProcess 控制器，可调用 expect/send/wait 等方法
   * 
   * @param command - 要执行的命令
   * @param options - 可选配置，包括 interactive: true 启用交互模式
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
      // 只在用户未配置 promptLineCount 时才自动检测
      if (!this.promptLineCountConfigured) {
        await this.detectPromptBeforeRecording();
      }

      // 生成 tmux session 名称
      const sessionName = `repterm-${Date.now().toString(36)}`;
      this.tmuxSessionName = sessionName;

      // Recording mode: 使用 asciinema --command 直接启动 tmux
      // 必须显式设置 TERM=xterm-256color，否则 asciinema 会检测父进程的终端类型
      this.session.start({
        shell: 'asciinema',
        args: ['rec', '--command', `tmux new -s ${sessionName}`, this.recordingPath, '--overwrite'],
        env: {
          TERM: 'xterm-256color',
        },
      });

      // 等待 tmux 启动就绪
      await this.waitForTmuxReady();

    } else if (this.ptyOnly) {
      // PTY-only 模式：直接启动 shell（不使用 asciinema/tmux）
      this.session.start();
      await this.waitForShellReady();

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
      const stepOptions = getCurrentStepOptions();
      const typingSpeed = stepOptions?.typingSpeed ?? 80;
      await this.typeWithDelay(text, typingSpeed);
    } else {
      this.session.write(text);
    }
  }

  /**
   * Wait for text to appear in terminal output
   * In recording mode with multi-pane, uses tmux capture-pane for isolation
   */
  async waitForText(text: string, options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout ?? 5000;
    const shouldStripAnsi = options.stripAnsi ?? true;  // Default to true
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      let output: string;

      if (this.recording && this.paneIndex !== undefined && this.tmuxSessionName) {
        // Recording mode: capture current pane's output via tmux
        const rawOutput = await this.capturePaneOutput();
        // Strip ANSI sequences if enabled (default)
        output = shouldStripAnsi ? this.stripAnsi(rawOutput) : rawOutput;
      } else {
        // Non-recording mode: use session buffer
        output = this.getAllOutput();
      }

      if (output.includes(text)) {
        return;
      }
      await this.sleep(100);
    }

    throw new Error(`Timeout waiting for text "${text}" after ${timeout}ms`);
  }

  /**
   * Get snapshot of current terminal output
   * In recording mode, returns current pane's output (stripped of ANSI)
   */
  async snapshot(): Promise<string> {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }

    if (this.recording && this.paneIndex !== undefined && this.tmuxSessionName) {
      // Recording mode: capture current pane's output
      const rawOutput = await this.capturePaneOutput();
      return this.stripAnsi(rawOutput);
    }

    return this.getAllOutput();
  }

  /**
   * Get all output (session + non-interactive commands)
   */
  private getAllOutput(): string {
    const sessionOutput = this.session.getOutput();
    return sessionOutput + this.nonInteractiveOutput;
  }

  /**
   * Capture output from current pane using tmux capture-pane
   * Used in recording mode for per-pane output isolation
   */
  private async capturePaneOutput(): Promise<string> {
    if (!this.tmuxSessionName || this.paneIndex === undefined) {
      return '';
    }

    // Use tmux capture-pane to get current pane's text content
    // -p: output to stdout instead of buffer
    // -t: specify target pane
    // -S -: start from scrollback top
    // -E -: end at current line
    const result = await this.runTmuxCommand(
      `capture-pane -p -t ${this.tmuxSessionName}:0.${this.paneIndex} -S - -E -`
    );

    // Update shared pane output buffer
    this.sharedState.paneOutputs.set(this.paneIndex, result);

    return result;
  }

  /**
   * Execute a tmux command and return its output
   */
  private async runTmuxCommand(args: string): Promise<string> {
    try {
      const proc = Bun.spawn(['tmux', ...args.split(' ')], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * Strip ANSI escape sequences from text
   */
  private stripAnsi(text: string): string {
    // Match common ANSI escape sequences
    const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[=>]|\x1b\[\?[0-9;]*[a-zA-Z]/g;
    return text.replace(ansiRegex, '');
  }

  /**
   * Append output from non-interactive command (internal use)
   */
  appendNonInteractiveOutput(output: string): void {
    this.nonInteractiveOutput += output;
  }

  /**
   * Record a command execution result for failure diagnostics
   */
  appendCommandLog(log: CommandLog): void {
    this.commandLogs.push({ ...log });
  }

  /**
   * Get command logs captured during the current test
   */
  getCommandLogs(): CommandLog[] {
    return this.commandLogs.map((log) => ({ ...log }));
  }

  /**
   * 设置插件工厂（用于 create() 自动注入插件）
   * @internal 由插件系统调用
   */
  setPluginFactory<TPlugins>(factory: PluginFactory<TPlugins>): void {
    this.pluginFactory = factory;
  }

  /**
   * Create a new terminal instance (for multi-terminal tests)
   * - Recording mode: splits tmux window (tmux already started via asciinema --command)
   * - Non-recording mode: creates independent terminal
   * - If pluginFactory is set, new terminal will have plugins property
   */
  async create<TPlugins = Record<string, unknown>>(): Promise<TerminalWithPlugins<TPlugins>> {
    let newTerminal: Terminal;

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
      newTerminal = new Terminal({
        recording: true,
        tmuxSessionName: this.tmuxSessionName,
      });
      newTerminal.setParentSession(this.session, this.sharedState, newPaneIndex);
    } else {
      // 非录制模式：创建独立终端
      newTerminal = new Terminal({ recording: false });
    }

    // 如果有插件工厂，为新终端创建插件实例
    if (this.pluginFactory) {
      newTerminal.pluginFactory = this.pluginFactory;
      newTerminal.plugins = this.pluginFactory(newTerminal);
    }

    return newTerminal as TerminalWithPlugins<TPlugins>;
  }

  /**
   * Close the terminal
   */
  async close(): Promise<void> {
    if (!this.closed) {
      const tmuxSessionToClean = this.tmuxSessionName;  // 保存 session 名称

      if (this.recording && this.tmuxSessionName && this.session.isActive()) {
        // 录制结束前等待 2 秒，让用户看到最后的输出
        await this.sleep(2000);
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
   * Check if terminal is in recording mode
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * 是否使用 PTY 模式（录制或 pty-only）
   * PTY 模式支持交互式命令，但打字效果仅在 recording 模式下启用
   */
  isPtyMode(): boolean {
    return this.recording || this.ptyOnly;
  }

  /**
   * Get pane index (for tmux commands)
   */
  getPaneIndex(): number | undefined {
    return this.paneIndex;
  }

  /**
   * Get session output (for non-recording PTY mode)
   */
  getSessionOutput(): string {
    return this.session.getOutput();
  }

  /**
   * Get output length at current moment (for range capture)
   */
  getOutputLength(): number {
    return this.session.getOutput().length;
  }

  /**
   * Get the state recorded before sending Enter (for output capture)
   */
  getBeforeEnterState(): { historySize: number; cursorY: number; commandLineCount: number } {
    return {
      historySize: this.beforeEnterHistorySize,
      cursorY: this.beforeEnterCursorY,
      commandLineCount: this.commandLineCount,
    };
  }

  /**
   * Record state before sending Enter (internal use)
   * 使用单次 tmux 查询原子获取 history_size 和 cursor_y，避免竞态条件
   */
  private async recordBeforeEnterState(): Promise<void> {
    if (!this.tmuxSessionName || this.paneIndex === undefined) return;

    try {
      // ★ 原子查询：一次 tmux 调用同时获取 history_size 和 cursor_y
      const proc = Bun.spawn(['tmux', 'display-message', '-t', `${this.tmuxSessionName}:0.${this.paneIndex}`, '-p', '#{history_size}:#{cursor_y}'], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const parts = stdout.trim().split(':');
      this.beforeEnterHistorySize = parseInt(parts[0], 10) || 0;
      this.beforeEnterCursorY = parseInt(parts[1], 10) || 0;
    } catch {
      this.beforeEnterHistorySize = 0;
      this.beforeEnterCursorY = 0;
    }
  }

  /**
   * 在录制开始前检测提示符相关信息
   * - 提示符占用的行数
   * - 提示符匹配 pattern
   * 通过创建临时 tmux session 来测量，检测过程不会出现在录制中
   */
  private async detectPromptBeforeRecording(): Promise<void> {
    const tempSessionName = `repterm-detect-${Date.now()}`;
    const testMarker = '__REPTERM_PROMPT_TEST__';

    try {
      // 创建临时 tmux session
      await Bun.spawn(['tmux', 'new-session', '-d', '-s', tempSessionName, '-x', '80', '-y', '24']).exited;
      await this.sleep(1000); // 等待 shell 启动

      // ★ 检测提示符 pattern（在发送命令前捕获干净的提示符）
      const promptCaptureProc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', tempSessionName], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const promptScreen = await new Response(promptCaptureProc.stdout).text();
      await promptCaptureProc.exited;
      this.detectedPromptPattern = this.analyzePromptLine(promptScreen);

      // 发送测试命令（用于检测提示符行数）
      await Bun.spawn(['tmux', 'send-keys', '-t', tempSessionName, `echo ${testMarker}`, 'Enter']).exited;
      await this.sleep(1000); // 等待命令执行完成

      // 获取当前 cursorY
      const cursorProc = Bun.spawn(['tmux', 'display-message', '-t', tempSessionName, '-p', '#{cursor_y}'], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const cursorY = parseInt((await new Response(cursorProc.stdout).text()).trim(), 10) || 0;
      await cursorProc.exited;

      // 捕获屏幕内容
      const captureProc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', tempSessionName, '-S', '0', '-E', String(cursorY)], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const screenContent = await new Response(captureProc.stdout).text();
      await captureProc.exited;

      // 找到测试字符串的行（找最后一次出现，即 echo 的输出，而非命令回显）
      const lines = screenContent.split('\n');
      let markerLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(testMarker)) {
          markerLine = i;  // 不 break，继续找下一个，最终得到最后一次出现的位置
        }
      }

      if (markerLine >= 0) {
        // 提示符行数 = cursorY - markerLine
        this.promptLineCount = cursorY - markerLine;
        if (this.promptLineCount < 1) this.promptLineCount = 1;
      }

      // 关闭临时 session
      await Bun.spawn(['tmux', 'kill-session', '-t', tempSessionName]).exited;
    } catch {
      // 检测失败时保持默认值
      this.promptLineCount = 0;
      this.detectedPromptPattern = undefined;
      // 尝试清理临时 session
      try {
        await Bun.spawn(['tmux', 'kill-session', '-t', tempSessionName]).exited;
      } catch { /* ignore */ }
    }
  }

  /**
   * 分析提示符行，生成匹配正则
   */
  private analyzePromptLine(screenContent: string): RegExp | undefined {
    const lines = screenContent.trim().split('\n');
    const promptLine = lines[lines.length - 1] || '';

    if (!promptLine.trim()) {
      return undefined;
    }

    // 常见提示符字符
    const promptChars = ['$', '#', '%', '>', '❯', '→', 'λ', '»', '❮', '›', '⟩'];

    // 查找提示符字符的位置（选最后出现的）
    let foundChar = '';
    let charIndex = -1;

    for (const char of promptChars) {
      const idx = promptLine.indexOf(char);
      if (idx !== -1 && idx > charIndex) {
        charIndex = idx;
        foundChar = char;
      }
    }

    if (charIndex === -1) {
      return undefined;
    }

    // 分析提示符后的内容
    const afterPrompt = promptLine.substring(charIndex + 1);
    const hasRightContent = afterPrompt.trim().length > 0;

    // 转义特殊正则字符
    const escapedChar = foundChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (hasRightContent) {
      // 右侧提示符布局：提示符后有多个空格再有内容
      return new RegExp(`${escapedChar}\\s{2,}`);
    } else {
      // 传统布局：提示符在行尾
      return new RegExp(`${escapedChar}\\s*$`);
    }
  }

  /**
   * 获取检测到的提示符行数
   */
  getPromptLineCount(): number {
    return this.promptLineCount;
  }

  /**
   * 获取检测到的提示符匹配 pattern
   */
  getDetectedPromptPattern(): RegExp | undefined {
    return this.detectedPromptPattern;
  }

  /**
   * Type text with human-like delays (for recording mode)
   * @param text - 要打字的文本
   * @param speed - 每字符延迟 (ms)，默认 80ms
   * @param variableSpeed - 是否使用变速模式（更自然）
   */
  private async typeWithDelay(
    text: string,
    speed: number = 80,
    variableSpeed: boolean = true
  ): Promise<void> {
    if (speed === 0) {
      // 速度为 0 时直接写入
      this.session.write(text);
      return;
    }

    let momentum = 0; // 打字动量，模拟熟练度

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      this.session.write(char);

      let delay: number;

      if (variableSpeed) {
        // 变速模式：模拟真实打字的加速和减速
        const baseDelay = Math.max(speed * 0.5, speed - momentum * 5);

        if (char === ' ' || char === '\n') {
          // 单词边界：重置动量，稍长停顿
          momentum = 0;
          delay = baseDelay + speed * 0.3;
        } else {
          // 连续打字：逐渐加速
          momentum = Math.min(momentum + 1, 10);
          delay = baseDelay + (Math.random() - 0.5) * speed * 0.4;
        }

        // 标点符号后额外停顿
        if ('.,:;!?'.includes(char)) {
          delay += speed * 0.5;
        }
      } else {
        // 原有模式：固定速度 ± 30%
        delay = speed + (Math.random() - 0.5) * speed * 0.6;
      }

      await this.sleep(delay);

      // 引号特殊处理
      if (char === '"' || char === "'") {
        await this.sleep(50);
      }
    }
  }

  /**
   * 在录制中显示步骤标题
   */
  private async displayStepTitle(title: string): Promise<void> {
    if (!this.recording) return;

    const stepOptions = getCurrentStepOptions();
    const typingSpeed = stepOptions?.typingSpeed;

    // 显示注释形式的标题
    const comment = `# === ${title} ===`;
    await this.typeWithDelay(comment, typingSpeed ?? 40, false);
    this.session.write('\r');
    if (typingSpeed !== 0) {
      await this.sleep(500); // 让标题显示片刻
    }
  }

  /**
   * Wait for command to complete
   * Uses prompt detection only
   */
  private async waitForOutputStable(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    // 检测行中任意位置的提示符（支持右侧提示符布局）
    // 提示符后面通常跟着空格（输入区域）
    // 使用检测到的 pattern，或默认 pattern
    const promptPattern = this.detectedPromptPattern ?? /[\$#%>❯→λ»]\s+/;
    const checkInterval = 100;

    while (Date.now() - startTime < timeout) {
      await this.sleep(checkInterval);

      const output = this.recording
        ? await this.capturePaneOutput()
        : this.session.getOutput();

      const lastLine = output.trim().split('\n').pop() || '';
      if (promptPattern.test(lastLine)) {
        return;
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for output to stabilize (public, for PTYProcessImpl)
   */
  async waitForOutputStablePublic(timeout: number = 10000): Promise<void> {
    return this.waitForOutputStable(timeout);
  }

  /**
   * Execute command in PTY (internal, for PTYProcessImpl)
   */
  async executeInPty(command: string, options?: {
    typingSpeed?: number;
    pauseBefore?: number;
    showStepTitle?: boolean;
    stepName?: string;
  }): Promise<void> {
    // Initialize session on first command
    if (!this.session.isActive()) {
      await this.initializeSession();
    }

    // ★ 命令前暂停
    if (this.recording && options?.pauseBefore) {
      await this.sleep(options.pauseBefore);
    }

    // ★ 显示步骤标题（每个 step 只显示一次）
    if (this.recording && shouldShowStepTitle() && options?.stepName) {
      await this.displayStepTitle(options.stepName);
      markStepTitleShown();
    }

    // ★ 记录命令行数（直接从命令内容计算，最可靠）
    this.commandLineCount = command.split('\n').length;

    // In recording mode, type with human-like delay
    if (this.recording) {
      await this.selectPane();
      await this.sleep(300);

      const hasNewline = command.includes('\n');
      const typingSpeed = options?.typingSpeed ?? 80;

      if (hasNewline && this.tmuxSessionName) {
        // 多行命令：使用 Bracketed Paste Mode 避免续行提示符
        await this.pasteWithTmux(command);
      } else if (typingSpeed === 0) {
        // 禁用打字效果时：快速写入
        this.session.write(command);
        await this.sleep(100);
        // ★ 在发送 Enter 之前记录状态
        await this.recordBeforeEnterState();
        this.session.write('\r');
      } else {
        // 正常命令：人工打字效果（无论长度）
        await this.typeWithDelay(command, typingSpeed, true);
        // ★ 在发送 Enter 之前记录状态
        await this.recordBeforeEnterState();
        this.session.write('\r');
      }
    } else {
      this.session.write(command + '\n');
    }

    await this.sleep(50);
  }

  /**
   * 使用 Bracketed Paste Mode 粘贴多行命令
   * 避免 shell 显示续行提示符（如 quote>、pipe heredoc>）
   * 
   * Bracketed Paste Mode 使用转义序列包裹粘贴内容：
   * - \x1b[200~ 标记粘贴开始
   * - \x1b[201~ 标记粘贴结束
   * Shell 会将整个内容作为单个输入块处理，不显示续行提示符
   */
  private async pasteWithTmux(command: string): Promise<void> {
    const paneTarget = `${this.tmuxSessionName}:0.${this.paneIndex}`;

    // Bracketed Paste Mode 转义序列
    const PASTE_START = '\x1b[200~';  // ESC [ 200 ~
    const PASTE_END = '\x1b[201~';    // ESC [ 201 ~

    // 包裹命令内容（不包含最后的回车，回车在粘贴结束后单独发送）
    const wrappedContent = PASTE_START + command + PASTE_END;

    // 使用 tmux send-keys -l 发送字面内容（包含转义序列）
    await Bun.spawn(['tmux', 'send-keys', '-l', '-t', paneTarget, wrappedContent]).exited;

    // 等待 shell 处理
    await this.sleep(500);

    // ★ 在发送 Enter 之前记录状态（用于输出范围捕获）
    await this.recordBeforeEnterState();

    // 发送回车执行命令
    await Bun.spawn(['tmux', 'send-keys', '-t', paneTarget, 'Enter']).exited;

    await this.sleep(200);
  }
}

/**
 * PTYProcess 实现类
 * 实现 PromiseLike 接口，支持 await 和控制器两种用法
 * 
 * 执行模式：
 * - 非录制、非交互：使用 Bun.spawn，stdout/stderr 分离，exitCode 精确
 * - 录制或交互：使用 PTY，支持 expect/send，但 exitCode 不可靠（返回 -1）
 */
class PTYProcessImpl implements PTYProcess {
  private terminal: Terminal;
  private commandStarted: boolean = false;
  private command: string;
  private options: RunOptions;
  private startTime: number;

  // 用于非录制、非交互模式的 Bun.spawn 进程
  private bunProcess?: ReturnType<typeof Bun.spawn>;
  private isInteractive: boolean;
  // 用于非录制交互模式的输出起始位置
  private beforeOutputLength: number = 0;

  constructor(terminal: Terminal, command: string, options: RunOptions = {}) {
    this.terminal = terminal;
    this.command = command;
    this.options = options;
    this.startTime = Date.now();
    this.isInteractive = options.interactive ?? false;
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

  // ===== 内部方法 =====

  /**
   * 判断是否使用 PTY 模式（录制、ptyOnly 或交互）
   * silent 模式强制使用 Bun.spawn 获取干净输出
   */
  private usePtyMode(): boolean {
    if (this.options.silent) {
      return false;
    }
    // 包含 ptyOnly 模式
    return this.terminal.isRecording() || this.terminal.isPtyMode() || this.isInteractive;
  }

  /**
   * 延时辅助方法
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 原子获取 pane 状态（history_size 和 cursor_y）
   * 使用单次 tmux 调用避免竞态条件
   */
  private async getPaneStateAtomic(): Promise<{ historySize: number; cursorY: number }> {
    if (!this.terminal.isRecording()) return { historySize: 0, cursorY: 0 };

    const tmuxSession = this.terminal.getTmuxSessionName();
    const paneIndex = this.terminal.getPaneIndex();
    if (!tmuxSession || paneIndex === undefined) return { historySize: 0, cursorY: 0 };

    try {
      const proc = Bun.spawn(['tmux', 'display-message', '-t', `${tmuxSession}:0.${paneIndex}`, '-p', '#{history_size}:#{cursor_y}'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const parts = stdout.trim().split(':');
      return {
        historySize: parseInt(parts[0], 10) || 0,
        cursorY: parseInt(parts[1], 10) || 0,
      };
    } catch {
      return { historySize: 0, cursorY: 0 };
    }
  }

  /**
   * 捕获 pane 指定范围的输出
   * @param startLine 起始行（负数=历史，正数=可见区域，'-'=历史开头）
   * @param endLine 结束行（'-'=当前位置）
   */
  private async capturePaneRange(startLine: string, endLine: string): Promise<string> {
    const tmuxSession = this.terminal.getTmuxSessionName();
    const paneIndex = this.terminal.getPaneIndex();
    if (!tmuxSession || paneIndex === undefined) return '';

    try {
      const proc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', `${tmuxSession}:0.${paneIndex}`, '-S', startLine, '-E', endLine], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      return this.stripAnsi(stdout);
    } catch {
      return '';
    }
  }

  /**
   * 去除 ANSI 转义序列
   */
  private stripAnsi(text: string): string {
    const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[=>]|\x1b\[\?[0-9;]*[a-zA-Z]/g;
    return text.replace(ansiRegex, '');
  }

  /**
   * 启动命令
   * - PTY 模式：通过 terminal.executeInPty 执行
   * - Bun.spawn 模式：直接启动子进程
   */
  private async startCommand(): Promise<void> {
    if (this.commandStarted) return;
    this.commandStarted = true;

    if (this.usePtyMode()) {
      // 录制模式或交互式：使用 PTY
      if (!this.terminal.isRecording()) {
        // 非录制交互模式：记录当前输出长度
        this.beforeOutputLength = this.terminal.getOutputLength();
      }
      // executeInPty 内部会在发送 Enter 前记录状态
      // ★ 从当前 step 上下文获取录制选项
      const stepOptions = getCurrentStepOptions();
      const stepName = getCurrentStepName();

      // 合并选项优先级：RunOptions > StepOptions > 默认值
      const executeOptions = {
        typingSpeed: this.options.typingSpeed ?? stepOptions?.typingSpeed,
        pauseBefore: this.options.pauseBefore ?? stepOptions?.pauseBefore,
        showStepTitle: stepOptions?.showStepTitle,
        stepName: stepName ?? undefined,
      };

      await this.terminal.executeInPty(this.command, executeOptions);
    } else {
      // 非录制、非交互：使用 Bun.spawn
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(this.options.env ?? process.env)) {
        if (value !== undefined && typeof value === 'string') {
          env[key] = value;
        }
      }

      this.bunProcess = Bun.spawn(['sh', '-c', this.command], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: this.options.cwd ?? process.cwd(),
        env,
      });
    }
  }

  // ===== 交互式控制方法 =====

  /**
   * Wait for specified text to appear
   * 仅在交互模式或录制模式下可用
   */
  async expect(text: string, options?: { timeout?: number }): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error('expect() requires interactive mode: terminal.run(cmd, { interactive: true })');
    }
    await this.startCommand();
    await this.terminal.waitForText(text, options);
  }

  /**
   * Send input to the process (with newline)
   * 仅在交互模式或录制模式下可用
   */
  async send(input: string): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error('send() requires interactive mode: terminal.run(cmd, { interactive: true })');
    }
    await this.startCommand();
    await this.terminal.send(input + '\r');
  }

  /**
   * Send raw input to the process (without newline)
   * 仅在交互模式或录制模式下可用
   */
  async sendRaw(input: string): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error('sendRaw() requires interactive mode: terminal.run(cmd, { interactive: true })');
    }
    await this.startCommand();
    await this.terminal.send(input);
  }

  /**
   * 启动命令执行，等待输入完成（不等待命令执行完成）
   * 用于 watch 等长时间运行的命令
   */
  async start(): Promise<void> {
    await this.startCommand();
  }

  /**
   * Wait for command to complete and return result
   */
  async wait(options?: { timeout?: number }): Promise<CommandResult> {
    await this.startCommand();

    const timeout = options?.timeout ?? this.options.timeout ?? 300000; // 5 minutes default

    if (this.usePtyMode()) {
      // PTY 模式：等待输出稳定
      await this.terminal.waitForOutputStablePublic(timeout);

      let output: string;
      if (this.terminal.isRecording()) {
        // 录制模式：使用发送 Enter 前记录的状态计算输出范围
        const beforeEnterState = this.terminal.getBeforeEnterState();
        const afterState = await this.getPaneStateAtomic();

        const { startLine: outputStartLine, endLine } = calculateOutputRange(
          beforeEnterState.cursorY,
          beforeEnterState.historySize,
          afterState.cursorY,
          afterState.historySize,
          this.terminal.getPromptLineCount(),
        );
        output = await this.capturePaneRange(String(outputStartLine), String(endLine));

        // 去除尾部空白行
        output = output.replace(/\n+$/, '').trim();
      } else {
        // 非录制交互模式：使用 session buffer
        const fullOutput = this.terminal.getSessionOutput();
        output = this.stripAnsi(fullOutput.substring(this.beforeOutputLength));
      }

      // ★ 命令后暂停（录制模式）
      if (this.terminal.isRecording()) {
        const stepOptions = getCurrentStepOptions();
        const pauseAfter = this.options.pauseAfter ?? stepOptions?.pauseAfter;

        if (pauseAfter && pauseAfter > 0) {
          await this.sleep(pauseAfter);
        }
      }

      const result = new CommandResultImpl({
        code: -1, // PTY 模式无法可靠获取退出码，设为 -1 表示不可用
        stdout: output,
        stderr: '',
        output,
        duration: Date.now() - this.startTime,
        command: this.command,
      });

      this.terminal.appendCommandLog({
        command: result.command,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        output: result.output,
        duration: result.duration,
      });

      return result;
    } else {
      // Bun.spawn 模式：等待进程结束
      try {
        const proc = this.bunProcess!;
        const stdoutStream = proc.stdout as ReadableStream<Uint8Array>;
        const stderrStream = proc.stderr as ReadableStream<Uint8Array>;

        const [stdout, stderr, exitCode] = await Promise.race([
          Promise.all([
            new Response(stdoutStream).text(),
            new Response(stderrStream).text(),
            proc.exited,
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              this.bunProcess?.kill();
              reject(new Error(`Command timeout after ${timeout}ms: ${this.command}`));
            }, timeout)
          ),
        ]);

        // 将输出存储到终端，支持 expect(terminal).toContainText() 断言
        const combinedOutput = stdout + stderr;
        this.terminal.appendNonInteractiveOutput(combinedOutput);

        const result = new CommandResultImpl({
          code: exitCode ?? -1,
          stdout,
          stderr,
          output: combinedOutput,
          duration: Date.now() - this.startTime,
          command: this.command,
        });

        this.terminal.appendCommandLog({
          command: result.command,
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
          output: result.output,
          duration: result.duration,
        });

        return result;
      } catch (error) {
        // Ensure process is killed on error
        this.bunProcess?.kill();
        throw error;
      }
    }
  }

  /**
   * Send Ctrl+C to interrupt the command
   * In recording mode with tmux, sends directly to the target pane
   */
  async interrupt(): Promise<void> {
    if (this.bunProcess) {
      this.bunProcess.kill('SIGINT');
    } else {
      const tmuxSession = this.terminal.getTmuxSessionName();
      const paneIndex = this.terminal.getPaneIndex();

      if (this.terminal.isRecording() && tmuxSession && paneIndex !== undefined) {
        // ★ 使用 tmux send-keys 直接发送到指定窗格
        // 不依赖当前活动窗格状态
        await Bun.spawn([
          'tmux', 'send-keys', '-t', `${tmuxSession}:0.${paneIndex}`, 'C-c'
        ]).exited;
      } else {
        await this.terminal.send('\x03');  // Ctrl+C
      }
    }
  }
}

/**
 * Create a new Terminal instance
 */
export function createTerminal(config?: TerminalConfig): Terminal {
  return new Terminal(config);
}
