/**
 * Terminal API implementation
 * Provides high-level terminal interaction (start/send/wait/snapshot)
 * 
 * Recording mode: Following simple-example.js pattern, wraps commands in asciinema
 */

import type { TerminalAPI, WaitOptions } from '../runner/models.js';
import { TerminalSession } from './session.js';
import { EventEmitter } from 'events';

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
   * Start a command in the terminal
   */
  async start(command: string): Promise<void> {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }

    // Initialize session on first command
    if (!this.session.isActive()) {
      await this.initializeSession();
    }

    // In recording mode, type with human-like delay
    if (this.recording) {
      // Select the correct pane before executing command
      await this.selectPane();

      // Think time before typing (like simple-example.js)
      await this.sleep(300);

      // Decide whether to type character-by-character or paste
      // Long commands (>50 chars) or multi-line commands are pasted
      const shouldPaste = command.length > 50 || command.includes('\n');

      if (shouldPaste) {
        // Paste mode: write directly (simulates Ctrl+V paste)
        this.session.write(command);
        await this.sleep(100);  // Brief pause after paste
      } else {
        // Type mode: character-by-character with delays
        await this.typeWithDelay(command);
      }

      this.session.write('\r');

      // Wait for command to execute (give time for output)
      await this.waitForOutputStable();

      // View time after command (let viewers see the output)
      await this.sleep(500);
    } else {
      // Non-recording mode: send command directly
      this.session.write(command + '\n');
      // Wait for command to be processed
      await this.sleep(50);
    }
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
      // Wait for shell to initialize
      await this.sleep(100);
    }

    this.initialized = true;
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
}

/**
 * Create a new Terminal instance
 */
export function createTerminal(config?: TerminalConfig): Terminal {
  return new Terminal(config);
}
