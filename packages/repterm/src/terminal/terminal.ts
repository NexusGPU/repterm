/**
 * Terminal API implementation
 * Provides high-level terminal interaction (start/send/wait/snapshot)
 *
 * Execution: non-recording/non-interactive uses Bun.spawn (separate stdout/stderr, exact exitCode);
 * recording or interactive uses PTY (rich interaction, exitCode unreliable).
 */

import type {
  TerminalAPI,
  WaitOptions,
  CommandResult,
  RunOptions,
  PTYProcess,
  PluginFactory,
  TerminalWithPlugins,
  CommandLog,
} from '../runner/models.js';
import { TerminalSession } from './session.js';
import { EventEmitter } from 'events';
import {
  getCurrentStepOptions,
  getCurrentStepName,
  shouldShowStepTitle,
  markStepTitleShown,
} from '../api/steps.js';
import {
  createShellInitFile,
  stripAnsiEnhanced,
  type ShellIntegrationMode,
  type ShellEvent,
} from './shell-integration.js';
import { createDollarFunction, type DollarFunction } from './dollar.js';

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
  recording?: boolean; // Enable recording (asciinema + tmux + typing)
  recordingPath?: string;
  ptyOnly?: boolean; // PTY-only (PTY, no recording/typing)
  tmuxSessionName?: string; // For multi-window recording
  tmuxPaneId?: string; // For split panes
  promptLineCount?: number; // Override prompt line count, skip auto-detect
  shellIntegration?: {
    enabled?: boolean; // default: true
    sentinelFallback?: boolean; // default: true
    shell?: string; // custom shell path override
  };
}

// Shared state for tracking pane count across Terminal and TerminalFactory
export interface SharedTerminalState {
  paneCount: number;
  currentActivePane?: number; // Track which pane is currently active
  paneOutputs: Map<number, string>; // Per-pane output buffers for isolation
}

/**
 * High-level Terminal API for test authoring
 */
export class Terminal extends EventEmitter implements TerminalAPI {
  private session: TerminalSession;
  private recording: boolean;
  private ptyOnly: boolean; // PTY-only flag
  private recordingPath?: string;
  private closed = false;
  private initialized = false;
  private tmuxSessionName?: string;
  private tmuxPaneId?: string;
  private sharedState: SharedTerminalState;
  private paneIndex?: number; // Index of the tmux pane this terminal is bound to
  private nonInteractiveOutput: string = ''; // Command output in non-interactive mode
  private commandLogs: CommandLog[] = []; // Commands run during test
  private pluginFactory?: PluginFactory<Record<string, unknown>>; // Plugin factory
  public plugins?: Record<string, unknown>; // Plugin instances (for new terminals)
  public $: DollarFunction; // Tagged template literal for command execution

  // Detected or configured prompt line count (default 0)
  private promptLineCount: number = 0;
  // Use user-configured value (skip auto-detect)
  private promptLineCountConfigured: boolean = false;
  // Detected prompt match pattern
  private detectedPromptPattern?: RegExp;
  // Shell integration state
  private shellIntegrationEnabled: boolean;
  private shellIntegrationMode: ShellIntegrationMode = 'regex';
  private shellInitCleanup?: () => void;
  private shellInitCmd?: string; // Shell command with integration init (e.g. 'bash --rcfile /path')
  private defaultCommandSet: boolean = false; // Whether setTmuxDefaultCommand has been called
  private lastExitCode: number = -1;
  // Baseline command_finished event count before current command (for OSC 133)
  private osc133BaselineCount: number = 0;

  constructor(config: TerminalConfig = {}) {
    super();
    this.recording = config.recording ?? false;
    this.ptyOnly = config.ptyOnly ?? false;
    this.recordingPath = config.recordingPath;
    this.tmuxSessionName = config.tmuxSessionName;
    this.tmuxPaneId = config.tmuxPaneId;
    this.sharedState = { paneCount: 1, paneOutputs: new Map() }; // Start with 1 pane
    this.paneIndex = 0; // Main terminal is pane 0
    this.nonInteractiveOutput = '';

    // Initialize $ tagged template literal
    this.$ = createDollarFunction((cmd, opts) => this.run(cmd, opts));

    // Use user promptLineCount and skip auto-detect
    if (config.promptLineCount !== undefined) {
      this.promptLineCount = config.promptLineCount;
      this.promptLineCountConfigured = true;
    }

    // Shell integration enabled by default
    this.shellIntegrationEnabled = config.shellIntegration?.enabled !== false;

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
  setParentSession(
    session: TerminalSession,
    sharedState: SharedTerminalState,
    paneIndex: number
  ): void {
    this.session = session;
    this.sharedState = sharedState;
    this.paneIndex = paneIndex;
    this.initialized = true; // Already initialized via parent
  }

  /**
   * Inherit prompt detection results from parent terminal.
   * Child terminals created via create() share the same shell prompt style,
   * so they should use the parent's detected prompt pattern instead of the
   * generic fallback regex (which fails with right-aligned prompt decorations).
   */
  inheritPromptConfig(parent: Terminal): void {
    if (parent.detectedPromptPattern) {
      this.detectedPromptPattern = parent.detectedPromptPattern;
    }
    if (parent.promptLineCount > 0 && !this.promptLineCountConfigured) {
      this.promptLineCount = parent.promptLineCount;
    }
    this.shellIntegrationEnabled = parent.shellIntegrationEnabled;
    // If parent confirmed OSC 133 works (passthrough enabled, markers detected),
    // child can start in osc133 mode directly — the new pane uses the same
    // shell init (via setTmuxDefaultCommand) and shares the same session/parser.
    // This avoids the fragile regex path and its race condition with right-aligned
    // prompt decorations entirely.
    this.shellIntegrationMode = parent.shellIntegrationMode;
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
      return; // Already on the correct pane
    }

    // Calculate how many panes to navigate
    // First split is horizontal (up/down), second is vertical (left/right), etc.
    // For simplicity, use Ctrl+B o to cycle through panes
    const panesToCycle =
      (this.paneIndex - currentActive + this.sharedState.paneCount) % this.sharedState.paneCount;

    for (let i = 0; i < panesToCycle; i++) {
      this.session.write('\x02'); // Ctrl+B (tmux prefix)
      await this.sleep(50);
      this.session.write('o'); // Cycle to next pane
      await this.sleep(150);
    }

    // Update current active pane
    this.sharedState.currentActivePane = this.paneIndex;
    // Sync parser so incoming OSC events are tagged to this pane
    this.session.getOSC133Parser().setActivePane(this.paneIndex);
  }

  /**
   * Public wrapper for selectPane — used by PTYProcessImpl.interrupt()
   * to switch tmux active pane before sending Ctrl+C, ensuring
   * DCS passthrough forwards the resulting D marker.
   */
  async selectPanePublic(): Promise<void> {
    return this.selectPane();
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

      // Build tmux command with optional shell integration via rcfile
      let tmuxCmd: string;
      let extraEnv: Record<string, string> = {};

      if (this.shellIntegrationEnabled) {
        const shell = process.env.SHELL || '/bin/bash';
        const initFile = createShellInitFile(shell);

        if (initFile.filePath) {
          this.shellInitCleanup = initFile.cleanup;
          extraEnv = initFile.env;
          const shellCmd = shell.includes('zsh')
            ? 'zsh' // zsh uses ZDOTDIR env var
            : `bash --rcfile ${initFile.filePath}`;
          this.shellInitCmd = shellCmd; // Save for tmux default-command
          tmuxCmd = `tmux new -s ${sessionName} '${shellCmd}'`;
        } else {
          // Unsupported shell or file creation failed → skip injection
          tmuxCmd = `tmux new -s ${sessionName}`;
        }
      } else {
        tmuxCmd = `tmux new -s ${sessionName}`;
      }

      // Recording: asciinema --command starts tmux. Set TERM=xterm-256color explicitly.
      this.session.start({
        shell: 'asciinema',
        args: ['rec', '--command', tmuxCmd, this.recordingPath, '--overwrite'],
        env: {
          TERM: 'xterm-256color',
          ...extraEnv,
        },
      });

      // Enable passthrough and wait for shell ready in parallel.
      // enableTmuxPassthroughWithRetry polls every 50ms until tmux session exists,
      // enabling passthrough ASAP so the initial OSC 133;A marker from shell init
      // flows through before the prompt appears.
      if (this.shellIntegrationEnabled) {
        const [passthroughOk] = await Promise.all([
          this.enableTmuxPassthroughWithRetry(sessionName),
          this.waitForTmuxReady(),
        ]);

        if (passthroughOk && this.session.hasShellIntegration()) {
          this.shellIntegrationMode = 'osc133';
        }
        // Initialize parser active pane to 0
        this.session.getOSC133Parser().setActivePane(0);
        // If passthrough failed (unlikely — tmux too old or timeout), lazy upgrade
        // in waitForOutputStable() will handle it on first real command.
      } else {
        await this.waitForTmuxReady();
      }

      // Detect actual prompt height from the live recording session.
      // The pre-detection uses a temp 80x24 session, but the recording session
      // may have different dimensions (e.g. wider terminal where prompt doesn't wrap).
      // cursor_y after first prompt = number of prompt lines - 1.
      if (!this.promptLineCountConfigured) {
        try {
          const proc = Bun.spawn(
            [
              'tmux',
              'display-message',
              '-t',
              `${sessionName}:0.0`,
              '-p',
              '#{cursor_y}:#{window_width}:#{window_height}',
            ],
            {
              stdout: 'pipe',
              stderr: 'pipe',
            }
          );
          const stdout = await new Response(proc.stdout).text();
          await proc.exited;
          const parts = stdout.trim().split(':');
          const cursorY = parseInt(parts[0], 10);
          if (!isNaN(cursorY)) {
            this.promptLineCount = cursorY + 1;
          }
        } catch {
          /* keep pre-detected value */
        }
      }
    } else if (this.ptyOnly) {
      // PTY-only: start shell with optional shell integration via rcfile
      if (this.shellIntegrationEnabled) {
        const shell = process.env.SHELL || '/bin/bash';
        const initFile = createShellInitFile(shell);

        if (initFile.filePath) {
          this.shellInitCleanup = initFile.cleanup;
          this.session.start({
            shell,
            args: initFile.shellArgs,
            env: initFile.env,
          });
        } else {
          // Unsupported shell or file creation failed → start without injection
          this.session.start();
        }
      } else {
        this.session.start();
      }
      await this.waitForShellReady();

      // Check if OSC 133 integration is active
      if (this.shellIntegrationEnabled && this.session.hasShellIntegration()) {
        this.shellIntegrationMode = 'osc133';
      }
    } else if (this.tmuxPaneId) {
      // This is a split pane, don't initialize a new session
      // Commands will be sent through the main terminal
      this.initialized = true;
      return;
    } else {
      // Non-recording mode: spawn shell directly
      // Inject OSC 133 when shell integration is enabled (for interactive commands)
      if (this.shellIntegrationEnabled) {
        const shell = process.env.SHELL || '/bin/bash';
        const initFile = createShellInitFile(shell);

        if (initFile.filePath) {
          this.shellInitCleanup = initFile.cleanup;
          this.session.start({
            shell,
            args: initFile.shellArgs,
            env: initFile.env,
          });
        } else {
          // Unsupported shell or file creation failed → start without injection
          this.session.start();
        }
      } else {
        this.session.start();
      }
      // Wait for shell to initialize and be ready
      await this.waitForShellReady();

      // Check if OSC 133 integration is active
      if (this.shellIntegrationEnabled && this.session.hasShellIntegration()) {
        this.shellIntegrationMode = 'osc133';
      }
    }

    this.initialized = true;
  }

  /**
   * Wait for shell to be ready (detect shell prompt)
   * When shell integration is enabled, uses OSC 133 prompt_start event for reliable detection.
   */
  private async waitForShellReady(timeout: number = 5000): Promise<void> {
    // If shell integration enabled, wait for OSC 133 prompt_start event
    if (this.shellIntegrationEnabled) {
      try {
        const parser = this.session.getOSC133Parser();
        await parser.waitForEvent('prompt_start', timeout);
        await this.sleep(100); // Extra wait for stability
        return;
      } catch {
        // Timeout: fall through to character-based detection
      }
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const output = this.session.getOutput();
      // Shell ready when prompt appears
      if (
        output.includes('$') ||
        output.includes('#') ||
        output.includes('%') ||
        output.includes('>')
      ) {
        await this.sleep(100); // Extra wait for stability
        return;
      }
      await this.sleep(50);
    }
    // Timeout: do not throw, continue
  }

  /**
   * Wait for tmux to be ready (detect shell prompt via character matching).
   * In recording mode, OSC 133 passthrough is not enabled yet, so we use character detection.
   */
  private async waitForTmuxReady(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const output = this.session.getOutput();
      // Tmux ready when prompt appears
      if (output.includes('$') || output.includes('#') || output.includes('%')) {
        await this.sleep(300); // Extra wait for stability
        return;
      }
      await this.sleep(100);
    }
    // On timeout, continue without throwing
  }

  /**
   * Wait for shell prompt to be ready (between commands or after interrupt).
   * In recording mode, polls tmux capture-pane for prompt pattern.
   * In OSC 133 mode, waits for prompt_start event.
   */
  async waitForPromptReady(timeout: number = 3000): Promise<boolean> {
    const promptPattern = this.detectedPromptPattern ?? /[\$#%>❯→λ»]\s*$/;

    if (this.recording && this.tmuxSessionName && this.paneIndex !== undefined) {
      // Recording mode: ALWAYS verify via capture-pane, because OSC 133
      // events can be stale (e.g. from before a watch/tail started).
      // A stale prompt_start event would make us return true even though
      // a foreground process is currently running and the prompt is gone.
      const startTime = Date.now();

      // Use osc133 as a hint: if a recent prompt_start exists, do one
      // quick capture-pane check. If that confirms the prompt, return fast.
      if (this.shellIntegrationMode === 'osc133') {
        const parser = this.session.getOSC133Parser();
        const existing = parser.getLastEvent('prompt_start', this.paneIndex);
        if (existing) {
          const output = await this.capturePaneOutput();
          const stripped = this.stripAnsi(output);
          const lastLine = stripped.trim().split('\n').pop() || '';
          if (promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
            return true;
          }
          // Stale event — fall through to polling
        }
      }

      while (Date.now() - startTime < timeout) {
        const output = await this.capturePaneOutput();
        const stripped = this.stripAnsi(output);
        const lastLine = stripped.trim().split('\n').pop() || '';
        if (promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
          return true;
        }
        await this.sleep(50);
      }
    } else if (this.shellIntegrationMode === 'osc133') {
      // Non-recording osc133: event-driven is reliable (no DCS passthrough issues)
      try {
        const parser = this.session.getOSC133Parser();
        await parser.waitForEvent('prompt_start', timeout, this.paneIndex);
        return true;
      } catch {
        // Fall through to character polling
      }
      // Fallback: poll session output
      const startTime = Date.now();
      while (Date.now() - startTime < Math.max(0, timeout - (Date.now() - startTime))) {
        const lastLine = this.getLastOutputLine();
        if (promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
          return true;
        }
        await this.sleep(50);
      }
    } else {
      // Non-recording, non-osc133: small polling window
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const lastLine = this.getLastOutputLine();
        if (promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
          return true;
        }
        await this.sleep(50);
      }
    }

    return false;
  }

  /**
   * Ensure the shell is ready for a new command. If not, try to recover by sending Ctrl+C.
   * This avoids writing new commands into a still-running foreground process (watch/tail/etc.).
   */
  private async ensurePromptReadyForNextCommand(): Promise<void> {
    if (await this.waitForPromptReady()) {
      return;
    }

    // Best-effort recovery: interrupt foreground process and wait for prompt.
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (this.recording && this.tmuxSessionName && this.paneIndex !== undefined) {
        // In recording mode, use tmux send-keys to target the specific pane.
        // Writing \x03 to the shared session goes to the tmux-active pane,
        // which might not be this terminal's pane after a selectPane() race.
        const paneTarget = `${this.tmuxSessionName}:0.${this.paneIndex}`;
        await Bun.spawn(['tmux', 'send-keys', '-t', paneTarget, 'C-c'], {
          stdout: 'pipe', stderr: 'pipe',
        }).exited;
      } else {
        this.session.write('\x03');
      }
      await this.sleep(500);
      if (await this.waitForPromptReady(2000)) {
        return;
      }
    }

    // Don't throw — allow the command to proceed anyway.
    // The worst case is that the command gets typed into a busy shell,
    // but throwing here would prevent any cleanup (finally blocks) from running.
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
    const shouldStripAnsi = options.stripAnsi ?? true; // Default to true
    const startTime = Date.now();

    if (this.recording && this.paneIndex !== undefined && this.tmuxSessionName) {
      // Recording mode: keep polling (tmux has no push mechanism for pane content)
      while (Date.now() - startTime < timeout) {
        const rawOutput = await this.capturePaneOutput();
        const output = shouldStripAnsi ? this.stripAnsi(rawOutput) : rawOutput;
        if (output.includes(text)) {
          return;
        }
        await this.sleep(100);
      }
      throw new Error(`Timeout waiting for text "${text}" after ${timeout}ms`);
    } else {
      // Non-recording mode: event-driven via session 'data' + terminal '_outputChanged'
      const remainingTimeout = Math.max(0, timeout - (Date.now() - startTime));
      return this.waitForSessionCondition(
        () => this.getAllOutput().includes(text),
        remainingTimeout,
        `Timeout waiting for text "${text}" after ${timeout}ms`,
        true
      );
    }
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
    return stripAnsiEnhanced(text);
  }

  /**
   * Append output from non-interactive command (internal use)
   */
  appendNonInteractiveOutput(output: string): void {
    this.nonInteractiveOutput += output;
    this.emit('_outputChanged');
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
  setPluginFactory<TPlugins extends Record<string, unknown>>(
    factory: PluginFactory<TPlugins>
  ): void {
    this.pluginFactory = (terminal) => factory(terminal);
  }

  /**
   * Create a new terminal instance (for multi-terminal tests)
   * - Recording mode: splits tmux window (tmux already started via asciinema --command)
   * - Non-recording mode: creates independent terminal
   * - If pluginFactory is set, new terminal will have plugins property
   */
  async create<TPlugins extends Record<string, unknown> = Record<string, unknown>>(): Promise<
    TerminalWithPlugins<TPlugins>
  > {
    let newTerminal: Terminal;

    if (this.recording && this.tmuxSessionName) {
      // Set tmux default-command once so new panes also get shell integration
      if (!this.defaultCommandSet && this.shellInitCmd) {
        await this.setTmuxDefaultCommand(this.tmuxSessionName, this.shellInitCmd);
        this.defaultCommandSet = true;
      }

      // Recording: Ctrl+B to split. Odd panes: horizontal ("), even: vertical (%).
      const currentPaneCount = this.sharedState.paneCount;
      const splitKey = currentPaneCount % 2 === 1 ? '"' : '%';

      this.session.write('\x02'); // Ctrl+B
      await this.sleep(100);
      this.session.write(splitKey);

      // Update pane tracking BEFORE sleep — new pane's shell init markers
      // (A/D/A) arrive during the sleep and must be tagged to the new pane
      const newPaneIndex = this.sharedState.paneCount;
      this.sharedState.paneCount++;
      this.sharedState.currentActivePane = newPaneIndex;
      this.session.getOSC133Parser().setActivePane(newPaneIndex);

      await this.sleep(800); // Wait for new pane to init

      // Active prompt polling: verify the new pane's shell is ready
      // (the 800ms sleep covers most cases, but slow shell init may need more)
      const paneTarget = `${this.tmuxSessionName}:0.${newPaneIndex}`;
      const promptPattern = this.detectedPromptPattern ?? /[\$#%>❯→λ»]\s*$/;
      const initDeadline = Date.now() + 9000; // Additional 9s after initial 800ms
      while (Date.now() < initDeadline) {
        try {
          const result = await this.runTmuxCommand(`capture-pane -p -t ${paneTarget}`);
          const stripped = this.stripAnsi(result);
          const lastLine = stripped.trim().split('\n').pop() || '';
          if (lastLine && promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
            break;
          }
        } catch {
          /* pane might not exist yet */
        }
        await this.sleep(100);
      }

      // Create a new Terminal bound to the new pane
      newTerminal = new Terminal({
        recording: true,
        tmuxSessionName: this.tmuxSessionName,
      });
      newTerminal.setParentSession(this.session, this.sharedState, newPaneIndex);
      newTerminal.inheritPromptConfig(this);
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
      const tmuxSessionToClean = this.tmuxSessionName; // Keep for cleanup

      if (this.recording && this.tmuxSessionName && this.session.isActive()) {
        // Wait 2s before ending so user sees final output
        await this.sleep(2000);
        // Ctrl+B d to detach tmux, which ends asciinema recording
        await this.sleep(300);
        this.session.write('\x02'); // Ctrl+B (tmux prefix)
        await this.sleep(100);
        this.session.write('d'); // detach
        await this.sleep(500); // Wait for asciinema to finish
      } else if (this.recording && this.session.isActive()) {
        // Recording without tmux - send Ctrl+D to end asciinema recording
        this.session.write('\x04'); // Ctrl+D
        await this.sleep(500);
      }

      // Use SIGTERM signal to kill the process
      this.session.kill('SIGTERM');
      this.closed = true;
      this.emit('close');

      // Clean up shell integration temp files
      if (this.shellInitCleanup) {
        this.shellInitCleanup();
        this.shellInitCleanup = undefined;
      }

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
   * Enable DCS passthrough for a tmux session.
   * Uses set-option (works even if tmux server is already running).
   * Poll until tmux session exists, then enable DCS passthrough.
   * Retries set-option every 50ms until success or timeout.
   * Returns true if passthrough was enabled, false on timeout.
   */
  private async enableTmuxPassthroughWithRetry(
    sessionName: string,
    timeout: number = 5000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const proc = Bun.spawn(
          ['tmux', 'set-option', '-t', sessionName, 'allow-passthrough', 'on'],
          { stdout: 'pipe', stderr: 'pipe' }
        );
        const code = await proc.exited;
        if (code === 0) return true;
      } catch {
        // spawn failed — continue retrying
      }
      await this.sleep(50);
    }
    return false;
  }

  /**
   * Set tmux default-command so new panes created via split also get shell integration.
   * Clears __REPTERM_SHELL_INTEGRATION env var so the guard check passes in the new shell.
   */
  private async setTmuxDefaultCommand(sessionName: string, shellCmd: string): Promise<void> {
    try {
      const cmd = `env __REPTERM_SHELL_INTEGRATION= ${shellCmd}`;
      const proc = Bun.spawn(['tmux', 'set-option', '-t', sessionName, 'default-command', cmd], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
    } catch {
      /* ignore */
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
   * Detect prompt before recording (line count, pattern) via temp tmux session.
   */
  private async detectPromptBeforeRecording(): Promise<void> {
    const tempSessionName = `repterm-detect-${Date.now()}`;
    const testMarker = '__REPTERM_PROMPT_TEST__';

    try {
      // Create temp tmux session
      await Bun.spawn(
        ['tmux', 'new-session', '-d', '-s', tempSessionName, '-x', '80', '-y', '24'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      ).exited;
      await this.sleep(1000); // Wait for shell to start

      // Capture prompt pattern before sending command
      const promptCaptureProc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', tempSessionName], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const promptScreen = await new Response(promptCaptureProc.stdout).text();
      await promptCaptureProc.exited;
      this.detectedPromptPattern = this.analyzePromptLine(promptScreen);

      // Send test command to detect prompt line count
      await Bun.spawn(['tmux', 'send-keys', '-t', tempSessionName, `echo ${testMarker}`, 'Enter'], {
        stdout: 'pipe',
        stderr: 'pipe',
      }).exited;
      await this.sleep(1000); // Wait for command to finish

      // Get current cursorY
      const cursorProc = Bun.spawn(
        ['tmux', 'display-message', '-t', tempSessionName, '-p', '#{cursor_y}'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );
      const cursorY = parseInt((await new Response(cursorProc.stdout).text()).trim(), 10) || 0;
      await cursorProc.exited;

      // Capture screen content
      const captureProc = Bun.spawn(
        ['tmux', 'capture-pane', '-p', '-t', tempSessionName, '-S', '0', '-E', String(cursorY)],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );
      const screenContent = await new Response(captureProc.stdout).text();
      await captureProc.exited;

      // Find test string line (last occurrence = echo output)
      const lines = screenContent.split('\n');
      let markerLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(testMarker)) {
          markerLine = i; // Keep going to get last occurrence
        }
      }

      if (markerLine >= 0) {
        // promptLineCount = cursorY - markerLine
        this.promptLineCount = cursorY - markerLine;
        if (this.promptLineCount < 1) this.promptLineCount = 1;
      }

      // Kill temp session
      await Bun.spawn(['tmux', 'kill-session', '-t', tempSessionName], {
        stdout: 'pipe',
        stderr: 'pipe',
      }).exited;
    } catch {
      // On failure keep defaults
      this.promptLineCount = 0;
      this.detectedPromptPattern = undefined;
      // Try to kill temp session
      try {
        await Bun.spawn(['tmux', 'kill-session', '-t', tempSessionName], {
          stdout: 'pipe',
          stderr: 'pipe',
        }).exited;
      } catch {
        /* ignore */
      }
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
      const idx = promptLine.lastIndexOf(char);
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
   * Get current shell integration mode
   */
  getShellIntegrationMode(): ShellIntegrationMode {
    return this.shellIntegrationMode;
  }

  /**
   * Get last captured exit code (from OSC 133 D marker)
   * Returns -1 if shell integration is not active or no exit code captured.
   */
  getLastExitCode(): number {
    return this.lastExitCode;
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
   * Wait for command to complete.
   * Uses three-layer detection: OSC 133 > Sentinel > Enhanced regex.
   * In recording mode with OSC 133, races L1 (D marker) against regex (prompt polling)
   * to avoid long waits when DCS passthrough drops the D marker after pane splits.
   */
  private async waitForOutputStable(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();

    // Layer 1: OSC 133 event-driven detection
    if (this.shellIntegrationMode === 'osc133') {
      const parser = this.session.getOSC133Parser();
      // Use baseline count recorded before command execution to avoid race condition
      const targetCount = this.osc133BaselineCount + 1;

      if (this.recording) {
        // Recording mode: race D marker against regex prompt polling.
        // DCS passthrough can lose D markers after pane splits, so we
        // poll for the prompt in parallel to avoid a full L1 timeout.
        const promptPattern = this.detectedPromptPattern ?? /[\$#%>❯→λ»]\s*$/;
        const checkInterval = 100;
        // Skip a few initial polls to give D marker time to arrive first
        const gracePolls = 3;
        let pollCount = 0;
        let resolved = false;

        // Listen for D marker event
        const onEvent = (event: ShellEvent) => {
          if (resolved) return;
          if (event.type !== 'command_finished') return;
          if (this.paneIndex !== undefined && event.paneIndex !== this.paneIndex) return;
          const count = parser.countEvents('command_finished', this.paneIndex);
          if (count >= targetCount) {
            resolved = true;
            this.lastExitCode = event.exitCode ?? 0;
          }
        };
        parser.on('event', onEvent);

        // Check if D marker already arrived
        if (parser.countEvents('command_finished', this.paneIndex) >= targetCount) {
          const events = parser
            .getEvents()
            .filter(
              (e) =>
                e.type === 'command_finished' &&
                (this.paneIndex === undefined || e.paneIndex === this.paneIndex)
            );
          if (events.length >= targetCount) {
            resolved = true;
            this.lastExitCode = events[targetCount - 1].exitCode ?? 0;
          }
        }

        while (!resolved && Date.now() - startTime < timeout) {
          await this.sleep(checkInterval);
          if (resolved) break;
          pollCount++;
          // After grace period, start checking prompt via regex
          if (pollCount > gracePolls) {
            const output = await this.capturePaneOutput();
            const stripped = this.stripAnsi(output);
            const lastLine = stripped.trim().split('\n').pop() || '';
            if (promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
              // Prompt detected — give D marker a brief grace period
              if (!resolved) {
                await this.sleep(200);
              }
              break;
            }
          }
        }

        parser.removeListener('event', onEvent);

        if (resolved) {
          return;
        }
        // D marker lost — prompt was detected by regex, exit code unknown
        this.lastExitCode = -1;
        return;
      }

      // Non-recording mode: pure L1 wait (no DCS passthrough issues)
      try {
        const event = await parser.waitForNthEvent(
          'command_finished',
          targetCount,
          timeout,
          this.paneIndex
        );
        this.lastExitCode = event.exitCode ?? 0;
        return;
      } catch {
        // Timeout: fall through to regex
      }
    }

    // Layer 2/3: Regex-based prompt detection (original behavior, improved)
    const promptPattern = this.detectedPromptPattern ?? /[\$#%>❯→λ»]\s*$/;

    if (this.recording) {
      // Recording mode: keep polling (tmux has no push mechanism)
      const checkInterval = 100;
      while (Date.now() - startTime < timeout) {
        await this.sleep(checkInterval);
        const output = await this.capturePaneOutput();
        const stripped = this.stripAnsi(output);
        const lastLine = stripped.trim().split('\n').pop() || '';
        if (promptPattern.test(lastLine) && this.isBarePromptLine(lastLine)) {
          break;
        }
      }
    } else {
      // Non-recording mode: event-driven via session 'data'
      const remainingTimeout = Math.max(0, timeout - (Date.now() - startTime));
      await this.waitForSessionCondition(
        () => {
          const output = this.session.getOutput();
          const stripped = this.stripAnsi(output);
          const lastLine = stripped.trim().split('\n').pop() || '';
          return promptPattern.test(lastLine);
        },
        remainingTimeout,
        undefined, // no throw on timeout (matches original behavior)
        false // no _outputChanged needed (prompt detection is PTY-only)
      );
    }

    // Lazy upgrade: if shell integration is enabled but wasn't detected during init
    // (e.g. passthrough enabled too late), check if markers arrived during this command.
    // If so, upgrade to osc133 mode for subsequent commands and capture this command's exit code.
    // Use per-pane check to avoid false positives from other panes' markers.
    if (this.shellIntegrationEnabled && this.shellIntegrationMode !== 'osc133') {
      const parser = this.session.getOSC133Parser();
      // Check if THIS pane has any prompt_start markers (not just any pane)
      let paneHasMarkers = parser.getLastEvent('prompt_start', this.paneIndex) !== undefined;
      if (!paneHasMarkers) {
        // Brief wait for markers to arrive through the PTY data stream.
        // Markers travel: shell → tmux passthrough → asciinema → PTY → parser.
        await this.sleep(200);
        paneHasMarkers = parser.getLastEvent('prompt_start', this.paneIndex) !== undefined;
      }
      if (paneHasMarkers) {
        this.shellIntegrationMode = 'osc133';
        // Try to capture exit code from this command's markers
        const targetCount = this.osc133BaselineCount + 1;
        const matching = parser
          .getEvents()
          .filter((e) => e.type === 'command_finished' && e.paneIndex === this.paneIndex);
        if (matching.length >= targetCount) {
          this.lastExitCode = matching[targetCount - 1].exitCode ?? -1;
        } else {
          // Markers not yet arrived — wait briefly
          try {
            const event = await parser.waitForNthEvent(
              'command_finished',
              targetCount,
              2000,
              this.paneIndex
            );
            this.lastExitCode = event.exitCode ?? -1;
          } catch {
            // Timeout: markers didn't arrive, keep regex mode for this command
            this.shellIntegrationMode = 'regex';
          }
        }
      }
    }
  }

  /**
   * Check if a line is a "bare" prompt — prompt character with no command text after it.
   * Used to distinguish a real prompt from a command echo line (e.g. "❯ kubectl wait ...")
   * that still contains the prompt character.
   */
  private isBarePromptLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;

    const promptChars = ['$', '#', '%', '>', '❯', '→', 'λ', '»', '❮', '›', '⟩'];
    for (const ch of promptChars) {
      const idx = trimmed.lastIndexOf(ch);
      if (idx >= 0) {
        const afterPrompt = trimmed.substring(idx + ch.length);
        if (
          afterPrompt.length === 0 ||
          afterPrompt.trim().length === 0 ||
          /^\s{2,}/.test(afterPrompt)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private getLastOutputLine(): string {
    const stripped = this.stripAnsi(this.session.getOutput());
    return stripped.trim().split('\n').pop() || '';
  }

  /**
   * Detect zsh/bsh continuation prompts (e.g. quote>, pipe quote>, dquote>).
   * When present, the shell is waiting for unfinished input and won't execute new commands.
   */
  private isContinuationPromptLine(line: string): boolean {
    const trimmed = line.trim().toLowerCase();
    return /(pipe\s+)?(quote|dquote|bquote|heredoc|cmdsubst)>\s*$/.test(trimmed);
  }

  private async recoverContinuationPrompt(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const lastLine = this.getLastOutputLine();
      if (!this.isContinuationPromptLine(lastLine)) {
        return;
      }
      this.session.write('\x03');
      await this.sleep(120);
    }
  }

  /**
   * Non-recording PTY path can corrupt very long single-line inputs when sent in one write.
   * Send in small chunks to keep shell line editor state stable.
   */
  private async writeCommandChunked(command: string, chunkSize: number = 256): Promise<void> {
    for (let i = 0; i < command.length; i += chunkSize) {
      this.session.write(command.slice(i, i + chunkSize));
      await this.sleep(2);
    }
    this.session.write('\n');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Event-driven condition wait for non-recording mode.
   * Listens to session 'data' and optionally terminal '_outputChanged'.
   */
  private waitForSessionCondition(
    checkFn: () => boolean,
    timeout: number,
    errorMessage?: string,
    listenOutputChanged: boolean = false
  ): Promise<void> {
    // Synchronous immediate check — handles "text already in buffer"
    if (checkFn()) {
      return Promise.resolve();
    }

    // Guard against negative timeout values from elapsed-time math.
    // timeout <= 0 means the wait budget is already exhausted.
    if (timeout <= 0) {
      if (errorMessage) {
        return Promise.reject(new Error(errorMessage));
      }
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        this.session.removeListener('data', onData);
        if (listenOutputChanged) {
          this.removeListener('_outputChanged', onOutputChanged);
        }
        clearTimeout(timer);
      };

      const check = () => {
        if (settled) return;
        if (checkFn()) {
          settled = true;
          cleanup();
          resolve();
        }
      };

      const onData = () => check();
      const onOutputChanged = () => check();

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        if (errorMessage) {
          reject(new Error(errorMessage));
        } else {
          resolve();
        }
      }, timeout);

      this.session.on('data', onData);
      if (listenOutputChanged) {
        this.on('_outputChanged', onOutputChanged);
      }
    });
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
  async executeInPty(
    command: string,
    options?: {
      typingSpeed?: number;
      pauseBefore?: number;
      showStepTitle?: boolean;
      stepName?: string;
    }
  ): Promise<void> {
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

    // Record OSC 133 baseline before sending command (avoid race condition)
    if (this.shellIntegrationMode === 'osc133') {
      this.osc133BaselineCount = this.session
        .getOSC133Parser()
        .countEvents('command_finished', this.paneIndex);
    }

    // In recording mode, type with human-like delay
    if (this.recording) {
      await this.selectPane();
      // Wait for shell prompt to be ready (replaces blind sleep;
      // critical after interrupt() or rapid sequential commands)
      await this.ensurePromptReadyForNextCommand();

      const hasNewline = command.includes('\n');
      const typingSpeed = options?.typingSpeed ?? 80;

      if (hasNewline && this.tmuxSessionName) {
        // Multiline: Bracketed Paste to avoid continuation prompt
        await this.pasteWithTmux(command);
      } else if (typingSpeed === 0) {
        // When typing disabled: write fast
        this.session.write(command);
        // Wait for tmux to render the command echo (including line wrapping).
        await this.sleep(200);
        this.session.write('\r');
      } else {
        // Normal command: human typing
        await this.typeWithDelay(command, typingSpeed, true);
        this.session.write('\r');
      }
    } else {
      await this.ensurePromptReadyForNextCommand();
      await this.recoverContinuationPrompt();
      if (command.length >= 900) {
        await this.writeCommandChunked(command);
      } else {
        this.session.write(command + '\n');
      }
    }

    await this.sleep(50);
  }

  /**
   * Bracketed Paste for multiline: \x1b[200~...\x1b[201~ so shell treats as single input, no continuation prompt.
   */
  private async pasteWithTmux(command: string): Promise<void> {
    const paneTarget = `${this.tmuxSessionName}:0.${this.paneIndex}`;

    // Bracketed Paste escape sequences
    const PASTE_START = '\x1b[200~'; // ESC [ 200 ~
    const PASTE_END = '\x1b[201~'; // ESC [ 201 ~

    // Wrap command (no final newline; send after paste)
    const wrappedContent = PASTE_START + command + PASTE_END;

    // tmux send-keys -l for literal content
    await Bun.spawn(['tmux', 'send-keys', '-l', '-t', paneTarget, wrappedContent], {
      stdout: 'pipe',
      stderr: 'pipe',
    }).exited;

    // Wait for shell to process
    await this.sleep(500);

    // Send Enter to run command
    await Bun.spawn(['tmux', 'send-keys', '-t', paneTarget, 'Enter'], {
      stdout: 'pipe',
      stderr: 'pipe',
    }).exited;

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

  /**
   * In PTY-only mode, very long single-line commands can occasionally leave
   * the shell in continuation prompt state; prefer spawn for reliability.
   */
  private shouldBypassPtyForLongCommand(): boolean {
    if (this.isInteractive) return false;
    if (this.options.silent) return false;
    if (this.terminal.isRecording()) return false;
    if (!this.terminal.isPtyMode()) return false;
    return this.command.length >= 900;
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
    if (this.shouldBypassPtyForLongCommand()) {
      return false;
    }
    // Include ptyOnly
    return this.terminal.isRecording() || this.terminal.isPtyMode() || this.isInteractive;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Strip ANSI escapes
   */
  private stripAnsi(text: string): string {
    return stripAnsiEnhanced(text);
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
      throw new Error(
        'expect() requires interactive mode: $({ interactive: true })`cmd` or terminal.run(cmd, { interactive: true })'
      );
    }
    await this.startCommand();
    await this.terminal.waitForText(text, options);
  }

  /**
   * Send input (with newline). Only in interactive or recording.
   */
  async send(input: string): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error(
        'send() requires interactive mode: $({ interactive: true })`cmd` or terminal.run(cmd, { interactive: true })'
      );
    }
    await this.startCommand();
    await this.terminal.send(input + '\r');
  }

  /**
   * Send raw input. Only in interactive or recording.
   */
  async sendRaw(input: string): Promise<void> {
    if (!this.usePtyMode()) {
      throw new Error(
        'sendRaw() requires interactive mode: $({ interactive: true })`cmd` or terminal.run(cmd, { interactive: true })'
      );
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
        // Wait for the new prompt to fully render in tmux pane.
        // In OSC 133 mode, waitForOutputStable returns on D marker, which fires
        // in precmd BEFORE zsh draws PS1. Complex prompts (starship, powerlevel10k)
        // may take 200-500ms to render after D marker. Poll capture-pane for a
        // "bare prompt" line (prompt char with no command text after it) to confirm
        // the new prompt has been fully drawn.
        await this.waitForBarePrompt();

        // Content-based output extraction: capture full pane, find command echo
        // and new prompt, extract everything in between. This avoids fragile
        // cursor-position math that breaks with line wrapping, complex prompts,
        // and timing-sensitive cursor reads.
        output = await this.extractOutputFromPane();

        // Trim trailing blank lines
        output = output.replace(/\n+$/, '').trim();
      } else {
        // Non-recording PTY: use session buffer with content-based extraction
        // to strip command echo and trailing prompt (same logic as recording mode).
        const fullOutput = this.terminal.getSessionOutput();
        const rawOutput = this.stripAnsi(fullOutput.substring(this.beforeOutputLength));
        output = this.extractOutputFromText(rawOutput);

        // Trim trailing blank lines
        output = output.replace(/\n+$/, '').trim();
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
        code:
          this.terminal.getShellIntegrationMode() === 'osc133'
            ? this.terminal.getLastExitCode()
            : -1, // PTY without shell integration: exitCode unreliable
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
   * Wait for a "bare prompt" to appear as the last line in the tmux pane.
   * A bare prompt is a line where the prompt character (❯, $, #, etc.) has
   * no command text after it — indicating the shell is ready for input.
   *
   * This distinguishes the NEW prompt from the old prompt + command echo line.
   * For example, "❯ (exit 1)" is NOT bare (has command text), but "❯ " IS bare.
   *
   * Used after waitForOutputStable (which returns on D marker before PS1 renders)
   * to ensure the prompt has been fully drawn before reading cursor position.
   */
  private async waitForBarePrompt(timeout: number = 5000): Promise<void> {
    const tmuxSession = this.terminal.getTmuxSessionName();
    const paneIndex = this.terminal.getPaneIndex();
    if (!tmuxSession || paneIndex === undefined) return;

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const proc = Bun.spawn(
          ['tmux', 'capture-pane', '-p', '-t', `${tmuxSession}:0.${paneIndex}`],
          {
            stdout: 'pipe',
            stderr: 'pipe',
          }
        );
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        const stripped = this.stripAnsi(stdout);
        const lines = stripped.trimEnd().split('\n');
        const lastLine = lines[lines.length - 1] || '';

        if (this.isBarePromptLine(lastLine)) {
          return;
        }
      } catch {
        // ignore tmux errors
      }
      await this.sleep(50);
    }
  }

  /**
   * Check if a line is a "bare" prompt — prompt character with no command text after it.
   */
  private isBarePromptLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;

    const promptChars = ['$', '#', '%', '>', '❯', '→', 'λ', '»', '❮', '›', '⟩'];
    for (const ch of promptChars) {
      const idx = trimmed.lastIndexOf(ch);
      if (idx >= 0) {
        const afterPrompt = trimmed.substring(idx + ch.length);
        // Bare prompt conditions:
        // 1. Nothing after prompt char
        // 2. Only whitespace after prompt char
        // 3. Content separated by 2+ spaces (right-aligned decoration like timestamps)
        //    A typed command has exactly 1 space: "❯ cmd", while bare has "❯  " or "❯   at 15:57"
        if (
          afterPrompt.length === 0 ||
          afterPrompt.trim().length === 0 ||
          /^\s{2,}/.test(afterPrompt)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Content-based output extraction from tmux pane.
   * Captures full pane (including scrollback), then delegates to extractOutputFromText.
   */
  private async extractOutputFromPane(): Promise<string> {
    const tmuxSession = this.terminal.getTmuxSessionName();
    const paneIndex = this.terminal.getPaneIndex();
    if (!tmuxSession || paneIndex === undefined) return '';

    try {
      // Capture full pane including scrollback
      const proc = Bun.spawn(
        ['tmux', 'capture-pane', '-p', '-t', `${tmuxSession}:0.${paneIndex}`, '-S', '-', '-E', '-'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const stripped = this.stripAnsi(stdout);
      return this.extractOutputFromText(stripped);
    } catch {
      return '';
    }
  }

  /**
   * Extract command output from terminal text content.
   * Finds the command echo line, finds the next bare prompt, returns everything in between.
   * Works with both tmux capture-pane output and raw PTY session buffer (after stripAnsi).
   *
   * @param strippedText - ANSI-stripped terminal text content
   */
  private extractOutputFromText(strippedText: string): string {
    // Clean \r from PTY raw output (tmux capture-pane doesn't have \r, but session buffer does)
    const lines = strippedText.split('\n').map((l) => l.replace(/\r/g, ''));

    // Find the LAST occurrence of the command text (command echo line).
    // Use the first line of the command for multiline commands (heredoc, etc.),
    // since each visual row in capture-pane is a separate line.
    const firstLine = this.command.split('\n')[0];
    const cmdPrefix = firstLine.substring(0, Math.min(40, firstLine.length));
    let cmdLine = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(cmdPrefix)) {
        cmdLine = i;
        break;
      }
    }

    if (cmdLine === -1) {
      // Command echo not found — fall back to empty
      return '';
    }

    // Handle command echo that wraps to multiple visual lines.
    // For multiline commands (heredoc, etc.), the command echo spans multiple lines.
    // Skip all lines that are part of the command text.
    let outputStart = cmdLine + 1;

    // For multiline commands (heredoc, etc.), skip additional command echo lines
    if (this.command.includes('\n')) {
      const cmdLines = this.command.split('\n');
      for (let j = 1; j < cmdLines.length && outputStart < lines.length; j++) {
        const expectedLine = cmdLines[j].trim();
        if (expectedLine && lines[outputStart]?.trim() === expectedLine) {
          outputStart++;
        }
      }
    }

    // Find the LAST bare prompt AFTER the command echo (this is the new prompt)
    let promptStart = lines.length; // default: end of text (no prompt found)
    for (let i = lines.length - 1; i > cmdLine; i--) {
      if (this.isBarePromptLine(lines[i])) {
        promptStart = i;
        // For multi-line prompts, the prompt might start above.
        // Adjust for promptLineCount (e.g., 2-line prompt starts 1 line above ❯).
        const promptCount = this.terminal.getPromptLineCount();
        if (promptCount > 1) {
          promptStart = Math.max(outputStart, i - (promptCount - 1));
        }
        break;
      }
    }

    // Extract output lines between command echo and prompt
    const outputLines = lines.slice(outputStart, promptStart);
    return outputLines.join('\n');
  }

  /**
   * Send Ctrl+C to interrupt the command.
   * In recording mode with tmux, sends via tmux send-keys with retry and
   * verification — two different communication channels (PTY for pane switching
   * vs tmux CLI for send-keys) can race, and DCS passthrough may drop markers
   * after pane splits, so we verify the prompt actually appeared.
   */
  async interrupt(): Promise<void> {
    if (this.bunProcess) {
      this.bunProcess.kill('SIGINT');
    } else {
      const tmuxSession = this.terminal.getTmuxSessionName();
      const paneIndex = this.terminal.getPaneIndex();

      if (this.terminal.isRecording() && tmuxSession && paneIndex !== undefined) {
        // Switch to the target pane first so DCS passthrough forwards the
        // D marker (command_finished) that the shell emits after receiving SIGINT
        await this.terminal.selectPanePublic();

        const maxAttempts = 3;
        const paneTarget = `${tmuxSession}:0.${paneIndex}`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          // Send C-c via tmux send-keys (targets pane directly)
          const proc = Bun.spawn(['tmux', 'send-keys', '-t', paneTarget, 'C-c'], {
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const exitCode = await proc.exited;

          if (exitCode !== 0) {
            // tmux send-keys failed — fall back to writing \x03 directly
            await this.terminal.send('\x03');
          }

          // Wait for signal processing
          await this.sleep(500);

          // Verify: check if prompt appeared (command actually stopped)
          try {
            const captureProc = Bun.spawn(['tmux', 'capture-pane', '-p', '-t', paneTarget], {
              stdout: 'pipe',
              stderr: 'pipe',
            });
            const output = await new Response(captureProc.stdout).text();
            await captureProc.exited;
            const stripped = stripAnsiEnhanced(output);
            const lastLine = stripped.trimEnd().split('\n').pop() || '';
            if (this.isBarePromptLine(lastLine)) {
              return; // Prompt detected — interrupt succeeded
            }
          } catch {
            /* continue retrying */
          }

          if (attempt < maxAttempts) {
            await this.sleep(300);
          }
        }

        // Final fallback: write Ctrl+C directly to the session
        await this.terminal.send('\x03');
        await this.sleep(500);
      } else {
        await this.terminal.send('\x03'); // Ctrl+C
        // Allow time for signal processing and trap handlers.
        // Full prompt recovery is handled by ensurePromptReadyForNextCommand() in executeInPty().
        await this.sleep(200);
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
