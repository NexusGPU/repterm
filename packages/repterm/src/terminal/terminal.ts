/**
 * Terminal API implementation
 * Provides high-level terminal interaction (start/send/wait/snapshot)
 * 
 * Execution: non-recording/non-interactive uses Bun.spawn (separate stdout/stderr, exact exitCode);
 * recording or interactive uses PTY (rich interaction, exitCode unreliable).
 */

import type { TerminalAPI, WaitOptions, CommandResult, RunOptions, PTYProcess, PluginFactory, TerminalWithPlugins, CommandLog } from '../runner/models.js';
import { TerminalSession } from './session.js';
import { EventEmitter } from 'events';
import { getCurrentStepOptions, getCurrentStepName, shouldShowStepTitle, markStepTitleShown } from '../api/steps.js';

/**
 * Compute tmux output capture line range. Pure function for unit testing.
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
 * CommandResult implementation with successful getter
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
  recording?: boolean;      // Enable recording (asciinema + tmux + typing)
  recordingPath?: string;
  ptyOnly?: boolean;        // PTY-only (PTY, no recording/typing)
  tmuxSessionName?: string;  // For multi-window recording
  tmuxPaneId?: string;  // For split panes
  promptLineCount?: number;  // Override prompt line count, skip auto-detect
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
  private ptyOnly: boolean;  // PTY-only flag
  private recordingPath?: string;
  private closed = false;
  private initialized = false;
  private tmuxSessionName?: string;
  private tmuxPaneId?: string;
  private sharedState: SharedTerminalState;
  private paneIndex?: number;  // Index of the tmux pane this terminal is bound to
  private nonInteractiveOutput: string = '';  // Command output in non-interactive mode
  private commandLogs: CommandLog[] = [];      // Commands run during test
  private pluginFactory?: PluginFactory<Record<string, unknown>>;  // Plugin factory
  public plugins?: Record<string, unknown>;  // Plugin instances (for new terminals)

  // State before sending Enter (for output range capture)
  private beforeEnterHistorySize: number = 0;
  private beforeEnterCursorY: number = 0;
  // Command line count from command content (most reliable)
  private commandLineCount: number = 0;
  // Detected or configured prompt line count (default 0)
  private promptLineCount: number = 0;
  // Use user-configured value (skip auto-detect)
  private promptLineCountConfigured: boolean = false;
  // Detected prompt match pattern
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

    // Use user promptLineCount and skip auto-detect
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
   * Run command; returns PTYProcess.
   * Non-recording/non-interactive: Bun.spawn, separate stdout/stderr, exact exitCode.
   * Recording or interactive: PTY, expect/send, exitCode -1.
   * Usage: await for CommandResult, or use controller (expect/send/wait).
   * @param command - Command to run
   * @param options - e.g. interactive: true
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
      // Auto-detect only when user did not set promptLineCount
      if (!this.promptLineCountConfigured) {
        await this.detectPromptBeforeRecording();
      }

      // Generate tmux session name
      const sessionName = `repterm-${Date.now().toString(36)}`;
      this.tmuxSessionName = sessionName;

      // Recording: asciinema --command starts tmux. Set TERM=xterm-256color explicitly.
      this.session.start({
        shell: 'asciinema',
        args: ['rec', '--command', `tmux new -s ${sessionName}`, this.recordingPath, '--overwrite'],
        env: {
          TERM: 'xterm-256color',
        },
      });

      // Wait for tmux to be ready
      await this.waitForTmuxReady();

    } else if (this.ptyOnly) {
      // PTY-only: start shell directly (no asciinema/tmux)
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
      // Shell ready when prompt appears
      if (output.includes('$') || output.includes('#') || output.includes('%') || output.includes('>')) {
        await this.sleep(100);  // Extra wait for stability
        return;
      }
      await this.sleep(50);
    }
    // Timeout: do not throw, continue
  }

  /**
   * Wait for tmux to be ready (detect shell prompt)
   */
  private async waitForTmuxReady(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const output = this.session.getOutput();
      // Tmux ready when prompt appears
      if (output.includes('$') || output.includes('#') || output.includes('%')) {
        await this.sleep(300);  // Extra wait for stability
        return;
      }
      await this.sleep(100);
    }
    // On timeout, continue without throwing
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
   * Set plugin factory (create() will inject plugins). @internal
   */
  setPluginFactory<TPlugins extends Record<string, unknown>>(factory: PluginFactory<TPlugins>): void {
    this.pluginFactory = (terminal) => factory(terminal);
  }

  /**
   * Create a new terminal instance (for multi-terminal tests)
   * - Recording mode: splits tmux window (tmux already started via asciinema --command)
   * - Non-recording mode: creates independent terminal
   * - If pluginFactory is set, new terminal will have plugins property
   */
  async create<TPlugins extends Record<string, unknown> = Record<string, unknown>>(): Promise<TerminalWithPlugins<TPlugins>> {
    let newTerminal: Terminal;

    if (this.recording && this.tmuxSessionName) {
      // Recording: Ctrl+B to split. Odd panes: horizontal ("), even: vertical (%).
      const currentPaneCount = this.sharedState.paneCount;
      const splitKey = currentPaneCount % 2 === 1 ? '"' : '%';

      this.session.write('\x02');  // Ctrl+B
      await this.sleep(100);
      this.session.write(splitKey);
      await this.sleep(800);      // Wait for new pane to init

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
      // Non-recording: create independent terminal
      newTerminal = new Terminal({ recording: false });
    }

    // If plugin factory set, create plugin instances for new terminal
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
      const tmuxSessionToClean = this.tmuxSessionName;  // Keep for cleanup

      if (this.recording && this.tmuxSessionName && this.session.isActive()) {
        // Wait 2s before ending so user sees final output
        await this.sleep(2000);
        // Ctrl+B d to detach tmux, which ends asciinema recording
        await this.sleep(300);
        this.session.write('\x02');  // Ctrl+B (tmux prefix)
        await this.sleep(100);
        this.session.write('d');     // detach
        await this.sleep(500);       // Wait for asciinema to finish

      } else if (this.recording && this.session.isActive()) {
        // Recording without tmux - send Ctrl+D to end asciinema recording
        this.session.write('\x04');  // Ctrl+D
        await this.sleep(500);
      }

      // Use SIGTERM signal to kill the process
      this.session.kill('SIGTERM');
      this.closed = true;
      this.emit('close');

      // After recording, clean up tmux session (outside recording)
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
   * Whether PTY mode (recording or pty-only). Typing effect only in recording.
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
   * Single tmux query for history_size and cursor_y to avoid race.
   */
  private async recordBeforeEnterState(): Promise<void> {
    if (!this.tmuxSessionName || this.paneIndex === undefined) return;

    try {
      // Atomic: single tmux call for history_size and cursor_y
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
   * Detect prompt before recording (line count, pattern) via temp tmux session.
   */
  private async detectPromptBeforeRecording(): Promise<void> {
    const tempSessionName = `repterm-detect-${Date.now()}`;
    const testMarker = '__REPTERM_PROMPT_TEST__';

    try {
      // Create temp tmux session
      await Bun.spawn(['tmux', 'new-session', '-d', '-s', tempSessionName, '-x', '80', '-y', '24']).exited;
      await this.sleep(1000); // Wait for shell to start

      // Capture prompt pattern before sending command
      const promptCaptureProc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', tempSessionName], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const promptScreen = await new Response(promptCaptureProc.stdout).text();
      await promptCaptureProc.exited;
      this.detectedPromptPattern = this.analyzePromptLine(promptScreen);

      // Send test command to detect prompt line count
      await Bun.spawn(['tmux', 'send-keys', '-t', tempSessionName, `echo ${testMarker}`, 'Enter']).exited;
      await this.sleep(1000); // Wait for command to finish

      // Get current cursorY
      const cursorProc = Bun.spawn(['tmux', 'display-message', '-t', tempSessionName, '-p', '#{cursor_y}'], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const cursorY = parseInt((await new Response(cursorProc.stdout).text()).trim(), 10) || 0;
      await cursorProc.exited;

      // Capture screen content
      const captureProc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', tempSessionName, '-S', '0', '-E', String(cursorY)], {
        stdout: 'pipe', stderr: 'pipe'
      });
      const screenContent = await new Response(captureProc.stdout).text();
      await captureProc.exited;

      // Find test string line (last occurrence = echo output)
      const lines = screenContent.split('\n');
      let markerLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(testMarker)) {
          markerLine = i;  // Keep going to get last occurrence
        }
      }

      if (markerLine >= 0) {
        // promptLineCount = cursorY - markerLine
        this.promptLineCount = cursorY - markerLine;
        if (this.promptLineCount < 1) this.promptLineCount = 1;
      }

      // Kill temp session
      await Bun.spawn(['tmux', 'kill-session', '-t', tempSessionName]).exited;
    } catch {
      // On failure keep defaults
      this.promptLineCount = 0;
      this.detectedPromptPattern = undefined;
      // Try to kill temp session
      try {
        await Bun.spawn(['tmux', 'kill-session', '-t', tempSessionName]).exited;
      } catch { /* ignore */ }
    }
  }

  /**
   * Analyze prompt line and build match regex
   */
  private analyzePromptLine(screenContent: string): RegExp | undefined {
    const lines = screenContent.trim().split('\n');
    const promptLine = lines[lines.length - 1] || '';

    if (!promptLine.trim()) {
      return undefined;
    }

    // Common prompt chars
    const promptChars = ['$', '#', '%', '>', '❯', '→', 'λ', '»', '❮', '›', '⟩'];

    // Find prompt char position (last occurrence)
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

    // Analyze content after prompt
    const afterPrompt = promptLine.substring(charIndex + 1);
    const hasRightContent = afterPrompt.trim().length > 0;

    // Escape regex special chars
    const escapedChar = foundChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (hasRightContent) {
      // Right-side prompt: spaces then content
      return new RegExp(`${escapedChar}\\s{2,}`);
    } else {
      // Traditional prompt: char followed by optional space
      // Don't anchor with $ — right-side content (e.g. time) may appear at runtime
      // even if absent during detection
      return new RegExp(`${escapedChar}(\\s|$)`);
    }
  }

  /**
   * Get detected prompt line count
   */
  getPromptLineCount(): number {
    return this.promptLineCount;
  }

  /**
   * Get detected prompt pattern
   */
  getDetectedPromptPattern(): RegExp | undefined {
    return this.detectedPromptPattern;
  }

  /**
   * Type text with human-like delays (for recording mode)
   * @param text - Text to type
   * @param speed - ms per char, default 80
   * @param variableSpeed - Variable speed for natural typing
   */
  private async typeWithDelay(
    text: string,
    speed: number = 80,
    variableSpeed: boolean = true
  ): Promise<void> {
    if (speed === 0) {
      // speed 0: write directly
      this.session.write(text);
      return;
    }

    let momentum = 0; // Typing momentum

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      this.session.write(char);

      let delay: number;

      if (variableSpeed) {
        // Variable speed: accelerate/decelerate
        const baseDelay = Math.max(speed * 0.5, speed - momentum * 5);

        if (char === ' ' || char === '\n') {
          // Word boundary: reset momentum, longer pause
          momentum = 0;
          delay = baseDelay + speed * 0.3;
        } else {
          // Continuous typing: speed up
          momentum = Math.min(momentum + 1, 10);
          delay = baseDelay + (Math.random() - 0.5) * speed * 0.4;
        }

        // Extra pause after punctuation
        if ('.,:;!?'.includes(char)) {
          delay += speed * 0.5;
        }
      } else {
        // Legacy: fixed speed +/- 30%
        delay = speed + (Math.random() - 0.5) * speed * 0.6;
      }

      await this.sleep(delay);

      // Special handling for quotes
      if (char === '"' || char === "'") {
        await this.sleep(50);
      }
    }
  }

  /**
   * Show step title in recording
   */
  private async displayStepTitle(title: string): Promise<void> {
    if (!this.recording) return;

    const stepOptions = getCurrentStepOptions();
    const typingSpeed = stepOptions?.typingSpeed;

    // Show title as comment
    const comment = `# === ${title} ===`;
    await this.typeWithDelay(comment, typingSpeed ?? 40, false);
    this.session.write('\r');
    if (typingSpeed !== 0) {
      await this.sleep(500); // Brief display
    }
  }

  /**
   * Wait for command to complete
   * Uses prompt detection only
   */
  private async waitForOutputStable(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    // Detect prompt (right-side layout); use detected or default pattern
    const promptPattern = this.detectedPromptPattern ?? /[\$#%>❯→λ»]\s*/;
    const checkInterval = 100;

    while (Date.now() - startTime < timeout) {
      await this.sleep(checkInterval);

      const output = this.recording
        ? await this.capturePaneOutput()
        : this.session.getOutput();

      const stripped = this.stripAnsi(output);
      const lastLine = stripped.trim().split('\n').pop() || '';
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

    // Pause before command
    if (this.recording && options?.pauseBefore) {
      await this.sleep(options.pauseBefore);
    }

    // Show step title (once per step)
    if (this.recording && shouldShowStepTitle() && options?.stepName) {
      await this.displayStepTitle(options.stepName);
      markStepTitleShown();
    }

    // Record command line count from content
    this.commandLineCount = command.split('\n').length;

    // In recording mode, type with human-like delay
    if (this.recording) {
      await this.selectPane();
      await this.sleep(300);

      const hasNewline = command.includes('\n');
      const typingSpeed = options?.typingSpeed ?? 80;

      if (hasNewline && this.tmuxSessionName) {
        // Multiline: Bracketed Paste to avoid continuation prompt
        await this.pasteWithTmux(command);
      } else if (typingSpeed === 0) {
        // When typing disabled: write fast
        this.session.write(command);
        await this.sleep(100);
        // Record state before sending Enter
        await this.recordBeforeEnterState();
        this.session.write('\r');
      } else {
        // Normal command: human typing
        await this.typeWithDelay(command, typingSpeed, true);
        // Record state before sending Enter
        await this.recordBeforeEnterState();
        this.session.write('\r');
      }
    } else {
      this.session.write(command + '\n');
    }

    await this.sleep(50);
  }

  /**
   * Bracketed Paste for multiline: \x1b[200~...\x1b[201~ so shell treats as single input, no continuation prompt.
   */
  private async pasteWithTmux(command: string): Promise<void> {
    const paneTarget = `${this.tmuxSessionName}:0.${this.paneIndex}`;

    // Bracketed Paste escape sequences
    const PASTE_START = '\x1b[200~';  // ESC [ 200 ~
    const PASTE_END = '\x1b[201~';    // ESC [ 201 ~

    // Wrap command (no final newline; send after paste)
    const wrappedContent = PASTE_START + command + PASTE_END;

    // tmux send-keys -l for literal content
    await Bun.spawn(['tmux', 'send-keys', '-l', '-t', paneTarget, wrappedContent]).exited;

    // Wait for shell to process
    await this.sleep(500);

    // Record state before Enter (for output range)
    await this.recordBeforeEnterState();

    // Send Enter to run command
    await Bun.spawn(['tmux', 'send-keys', '-t', paneTarget, 'Enter']).exited;

    await this.sleep(200);
  }
}

/**
 * PTYProcess impl. PromiseLike: await or controller. Non-recording: Bun.spawn, exact exitCode; recording/interactive: PTY, exitCode -1.
 */
class PTYProcessImpl implements PTYProcess {
  private terminal: Terminal;
  private commandStarted: boolean = false;
  private command: string;
  private options: RunOptions;
  private startTime: number;

  // Bun.spawn for non-recording, non-interactive
  private bunProcess?: ReturnType<typeof Bun.spawn>;
  private isInteractive: boolean;
  // Output start for non-recording interactive
  private beforeOutputLength: number = 0;

  constructor(terminal: Terminal, command: string, options: RunOptions = {}) {
    this.terminal = terminal;
    this.command = command;
    this.options = options;
    this.startTime = Date.now();
    this.isInteractive = options.interactive ?? false;
  }

  // ===== PromiseLike =====

  /** then(): called when awaiting proc
   */
  then<TResult1 = CommandResult, TResult2 = never>(
    onfulfilled?: ((value: CommandResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.wait().then(onfulfilled, onrejected);
  }

  /**
   * catch (convenience)
   */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<CommandResult | TResult> {
    return this.wait().catch(onrejected);
  }

  /**
   * finally (convenience)
   */
  finally(onfinally?: (() => void) | null): Promise<CommandResult> {
    return this.wait().finally(onfinally);
  }

  // ===== Internal =====

  /** PTY when recording/ptyOnly/interactive; silent forces Bun.spawn for clean output
   */
  private usePtyMode(): boolean {
    if (this.options.silent) {
      return false;
    }
    // Include ptyOnly
    return this.terminal.isRecording() || this.terminal.isPtyMode() || this.isInteractive;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get pane state atomically (single tmux call)
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
   * Capture pane output range. startLine/endLine: negative=history, '-'=start/current
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
   * Strip ANSI escapes
   */
  private stripAnsi(text: string): string {
    const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[=>]|\x1b\[\?[0-9;]*[a-zA-Z]/g;
    return text.replace(ansiRegex, '');
  }

  /**
   * Start: PTY via executeInPty or Bun.spawn
   */
  private async startCommand(): Promise<void> {
    if (this.commandStarted) return;
    this.commandStarted = true;

    if (this.usePtyMode()) {
      // Recording or interactive: use PTY
      if (!this.terminal.isRecording()) {
        // Non-recording interactive: record output length
        this.beforeOutputLength = this.terminal.getOutputLength();
      }
      // executeInPty records state before Enter; get options from step
      const stepOptions = getCurrentStepOptions();
      const stepName = getCurrentStepName();

      // Option priority: RunOptions > StepOptions > default
      const executeOptions = {
        typingSpeed: this.options.typingSpeed ?? stepOptions?.typingSpeed,
        pauseBefore: this.options.pauseBefore ?? stepOptions?.pauseBefore,
        showStepTitle: stepOptions?.showStepTitle,
        stepName: stepName ?? undefined,
      };

      await this.terminal.executeInPty(this.command, executeOptions);
    } else {
      // Non-recording, non-interactive: Bun.spawn
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

  // ===== Interactive =====

  /** Wait for text. Only in interactive or recording.
   */
  async expect(text: string, options?: { timeout?: number }): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error('expect() requires interactive mode: terminal.run(cmd, { interactive: true })');
    }
    await this.startCommand();
    await this.terminal.waitForText(text, options);
  }

  /**
   * Send input (with newline). Only in interactive or recording.
   */
  async send(input: string): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error('send() requires interactive mode: terminal.run(cmd, { interactive: true })');
    }
    await this.startCommand();
    await this.terminal.send(input + '\r');
  }

  /**
   * Send raw input. Only in interactive or recording.
   */
  async sendRaw(input: string): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error('sendRaw() requires interactive mode: terminal.run(cmd, { interactive: true })');
    }
    await this.startCommand();
    await this.terminal.send(input);
  }

  /**
   * Start command, wait for input only (e.g. watch).
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
      // PTY: wait for output to stabilize
      await this.terminal.waitForOutputStablePublic(timeout);

      let output: string;
      if (this.terminal.isRecording()) {
        // Recording: use state before Enter for output range
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

        // Trim trailing blank lines
        output = output.replace(/\n+$/, '').trim();
      } else {
        // Non-recording interactive: use session buffer
        const fullOutput = this.terminal.getSessionOutput();
        output = this.stripAnsi(fullOutput.substring(this.beforeOutputLength));
      }

      // Pause after command (recording)
      if (this.terminal.isRecording()) {
        const stepOptions = getCurrentStepOptions();
        const pauseAfter = this.options.pauseAfter ?? stepOptions?.pauseAfter;

        if (pauseAfter && pauseAfter > 0) {
          await this.sleep(pauseAfter);
        }
      }

      const result = new CommandResultImpl({
        code: -1, // PTY: exitCode unreliable
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
      // Bun.spawn: wait for process exit
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

        // Store output for expect(terminal).toContainText()
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
        // tmux send-keys to target pane
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
