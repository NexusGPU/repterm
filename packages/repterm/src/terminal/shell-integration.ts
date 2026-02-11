/**
 * OSC 133 Shell Integration module
 *
 * Provides three-layer prompt detection:
 * Layer 1: OSC 133 (FinalTerm standard) — precise semantic markers + exit code
 * Layer 2: Sentinel unique marker — impossible to appear in command output
 * Layer 3: Enhanced regex — improved existing approach (fallback)
 *
 * References:
 * - VS Code Terminal Shell Integration
 * - iTerm2 Shell Integration
 * - Windows Terminal Shell Integration
 * - WezTerm Shell Integration
 */

import { EventEmitter } from 'events';
import { writeFileSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ============================================================
// OSC 133 Constants
// ============================================================

export const OSC133 = {
  /** Prompt start (FTCS_PROMPT) */
  PROMPT_START:     '\x1b]133;A\x07',
  /** Command input start / prompt end (FTCS_COMMAND_START) */
  COMMAND_START:    '\x1b]133;B\x07',
  /** Command execution start / output start (FTCS_COMMAND_EXECUTED) */
  COMMAND_EXECUTED: '\x1b]133;C\x07',
  /** Command finished / output end + exit code (FTCS_COMMAND_FINISHED) */
  COMMAND_FINISHED_PREFIX: '\x1b]133;D',
  /** Pattern to match D marker with exit code (BEL or ST terminator) */
  COMMAND_FINISHED_PATTERN: /\x1b\]133;D;?(\d*)(?:\x07|\x1b\\)/g,
  /** Pattern to match all OSC 133 markers (BEL or ST terminator) */
  ALL_MARKERS_PATTERN: /\x1b\]133;([ABCD]);?([^\x07\x1b]*?)(?:\x07|\x1b\\)/g,
} as const;

// ============================================================
// Shell Event Types
// ============================================================

export interface ShellEvent {
  type: 'prompt_start' | 'command_start' | 'command_executed' | 'command_finished';
  timestamp: number;
  exitCode?: number;
  /** Byte offset in the output stream */
  rawPosition: number;
}

export type ShellIntegrationMode = 'osc133' | 'sentinel' | 'regex' | 'none';

// ============================================================
// OSC 133 Stream Parser
// ============================================================

/**
 * Streaming parser for OSC 133 shell integration markers.
 * Feeds raw PTY data and emits structured shell events.
 */
export class OSC133Parser extends EventEmitter {
  private totalBytesProcessed = 0;
  private pendingBuffer = '';
  private events: ShellEvent[] = [];
  private active = false;

  /** Whether any OSC 133 markers have been detected */
  isActive(): boolean {
    return this.active;
  }

  /** Get all recorded events */
  getEvents(): ShellEvent[] {
    return [...this.events];
  }

  /** Get the most recent event of a given type */
  getLastEvent(type: ShellEvent['type']): ShellEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === type) return this.events[i];
    }
    return undefined;
  }

  /** Count events of a given type */
  countEvents(type: ShellEvent['type']): number {
    return this.events.filter(e => e.type === type).length;
  }

  /** Feed raw PTY data into the parser */
  feed(data: string): void {
    this.pendingBuffer += data;
    this.parseBuffer();
    this.totalBytesProcessed += data.length;
  }

  /** Wait for the next event of a given type */
  waitForEvent(type: ShellEvent['type'], timeout: number): Promise<ShellEvent> {
    const existing = this.getLastEvent(type);
    if (existing) return Promise.resolve(existing);

    return new Promise<ShellEvent>((resolve, reject) => {
      let settled = false;

      const onEvent = (event: ShellEvent) => {
        if (settled || event.type !== type) return;
        settled = true;
        clearTimeout(timer);
        this.removeListener('event', onEvent);
        resolve(event);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.removeListener('event', onEvent);
        reject(new Error(`Timeout waiting for ${type} after ${timeout}ms`));
      }, timeout);

      this.on('event', onEvent);
    });
  }

  /** Wait for the Nth event of a given type */
  waitForNthEvent(type: ShellEvent['type'], n: number, timeout: number): Promise<ShellEvent> {
    const matching = this.events.filter(e => e.type === type);
    if (matching.length >= n) {
      return Promise.resolve(matching[n - 1]);
    }

    return new Promise<ShellEvent>((resolve, reject) => {
      let settled = false;
      let seen = matching.length;

      const onEvent = (event: ShellEvent) => {
        if (settled || event.type !== type) return;
        seen++;
        if (seen >= n) {
          settled = true;
          clearTimeout(timer);
          this.removeListener('event', onEvent);
          resolve(event);
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.removeListener('event', onEvent);
        reject(new Error(`Timeout waiting for ${n}th ${type} after ${timeout}ms`));
      }, timeout);

      this.on('event', onEvent);
    });
  }

  /** Reset parser state */
  reset(): void {
    this.events = [];
    this.active = false;
    this.pendingBuffer = '';
    this.totalBytesProcessed = 0;
    this.removeAllListeners('event');
  }

  private parseBuffer(): void {
    // Match OSC 133 markers terminated by either BEL (\x07) or ST (\x1b\\)
    const pattern = /\x1b\]133;([ABCD]);?([^\x07\x1b]*?)(?:\x07|\x1b\\)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = pattern.exec(this.pendingBuffer)) !== null) {
      const marker = match[1];
      const data = match[2];
      lastIndex = match.index + match[0].length;

      const typeMap: Record<string, ShellEvent['type']> = {
        'A': 'prompt_start',
        'B': 'command_start',
        'C': 'command_executed',
        'D': 'command_finished',
      };

      const event: ShellEvent = {
        type: typeMap[marker],
        timestamp: Date.now(),
        rawPosition: this.totalBytesProcessed + match.index,
      };

      if (marker === 'D' && data) {
        event.exitCode = parseInt(data, 10);
      }

      if (marker === 'A') {
        this.active = true;
      }

      this.events.push(event);
      this.emit('event', event);
    }

    // Keep potential incomplete sequences at end of buffer
    if (lastIndex > 0) {
      this.pendingBuffer = this.pendingBuffer.substring(lastIndex);
    } else if (this.pendingBuffer.length > 100) {
      // Prevent unbounded buffer growth; keep last ESC position
      const escIdx = this.pendingBuffer.lastIndexOf('\x1b');
      if (escIdx > 0) {
        this.pendingBuffer = this.pendingBuffer.substring(escIdx);
      } else {
        this.pendingBuffer = '';
      }
    }
  }
}

// ============================================================
// Shell Integration Script Generator
// ============================================================

/**
 * Check if a shell supports OSC 133 integration injection.
 * Currently only bash and zsh are supported.
 */
export function isShellSupported(shell: string): boolean {
  const basename = (shell.split('/').pop() || '').toLowerCase();
  return basename === 'bash' || basename === 'zsh'
    || basename.startsWith('bash') || basename.startsWith('zsh');
}

/**
 * Generate shell integration script for bash or zsh.
 * The script sets up OSC 133 markers using shell hooks.
 * Automatically detects tmux and uses DCS passthrough to forward markers.
 * Returns empty string for unsupported shells.
 */
export function getShellIntegrationScript(shell: string): string {
  if (!isShellSupported(shell)) return '';

  const isZsh = shell.includes('zsh');

  // Common helper: emit OSC via DCS passthrough when inside tmux
  const oscHelper = `
    # OSC output helper: use DCS passthrough inside tmux
    if [ -n "$TMUX" ]; then
        __repterm_osc() { printf '\\ePtmux;\\e\\e]%s\\007\\e\\\\' "$1"; }
    else
        __repterm_osc() { printf '\\e]%s\\007' "$1"; }
    fi`;

  if (isZsh) {
    return `
# Repterm OSC 133 Shell Integration (zsh)
if [[ -z "$__REPTERM_SHELL_INTEGRATION" ]]; then
    export __REPTERM_SHELL_INTEGRATION=1
${oscHelper}
    __repterm_precmd() {
        local exit_code=$?
        __repterm_osc "133;D;$exit_code"
        __repterm_osc "133;A"
    }
    __repterm_preexec() {
        __repterm_osc "133;C"
    }
    # Prepend to ensure $? is captured before other precmd functions modify it
    precmd_functions=(__repterm_precmd "\${precmd_functions[@]}")
    preexec_functions+=(__repterm_preexec)
    __repterm_osc "133;A"
fi
`;
  }

  // Bash
  return `
# Repterm OSC 133 Shell Integration (bash)
if [[ -z "$__REPTERM_SHELL_INTEGRATION" ]]; then
    export __REPTERM_SHELL_INTEGRATION=1
${oscHelper}
    __repterm_prompt_command() {
        local exit_code=$?
        __repterm_osc "133;D;$exit_code"
        __repterm_osc "133;A"
    }
    PROMPT_COMMAND="__repterm_prompt_command\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
    # Chain with existing DEBUG trap instead of overwriting
    __repterm_old_debug_trap=$(trap -p DEBUG | sed "s/trap -- '//;s/' DEBUG//")
    if [[ -n "$__repterm_old_debug_trap" ]]; then
        trap '__repterm_osc "133;C"; eval "$__repterm_old_debug_trap"' DEBUG
    else
        trap '__repterm_osc "133;C"' DEBUG
    fi
    __repterm_osc "133;A"
fi
`;
}

// ============================================================
// Temporary Init File Creator
// ============================================================

export interface ShellInitFile {
  /** Path to temp file (bash: rcfile path, zsh: ZDOTDIR path) */
  filePath: string;
  /** Arguments to pass to the shell (bash: ['--rcfile', path], zsh: []) */
  shellArgs: string[];
  /** Environment variables to set (zsh: { ZDOTDIR: ... }) */
  env: Record<string, string>;
  /** Cleanup function to remove temp files */
  cleanup: () => void;
}

const EMPTY_INIT: ShellInitFile = { filePath: '', shellArgs: [], env: {}, cleanup: () => {} };

/**
 * Create a temporary shell init file that injects OSC 133 integration.
 * For bash: creates a --rcfile that sources user's .bashrc then adds integration.
 * For zsh: creates a ZDOTDIR with .zshrc that sources user's config then adds integration.
 * Returns empty init for unsupported shells or on file creation failure (graceful degradation).
 */
export function createShellInitFile(shell: string): ShellInitFile {
  if (!isShellSupported(shell)) return EMPTY_INIT;

  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const isZsh = shell.includes('zsh');
  const integrationScript = getShellIntegrationScript(shell);

  try {
    if (isZsh) {
      const zdotdir = join(tmpdir(), `repterm-zdotdir-${id}`);
      mkdirSync(zdotdir, { recursive: true });
      const zshrc = join(zdotdir, '.zshrc');
      const content = [
        '# Source user zshrc',
        `[ -f "\${REPTERM_REAL_ZDOTDIR:-$HOME}/.zshrc" ] && source "\${REPTERM_REAL_ZDOTDIR:-$HOME}/.zshrc"`,
        integrationScript,
      ].join('\n');
      writeFileSync(zshrc, content);
      return {
        filePath: zdotdir,
        shellArgs: [],
        env: {
          ZDOTDIR: zdotdir,
          REPTERM_REAL_ZDOTDIR: process.env.ZDOTDIR || '',
        },
        cleanup: () => { try { rmSync(zdotdir, { recursive: true }); } catch { /* ignore */ } },
      };
    }

    // Bash: create temp rcfile
    const filePath = join(tmpdir(), `repterm-init-${id}.sh`);
    const content = [
      '# Source user bashrc',
      '[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"',
      integrationScript,
    ].join('\n');
    writeFileSync(filePath, content);
    return {
      filePath,
      shellArgs: ['--rcfile', filePath],
      env: {},
      cleanup: () => { try { unlinkSync(filePath); } catch { /* ignore */ } },
    };
  } catch {
    // File creation failed (disk full, permissions, etc.) → graceful degradation
    return EMPTY_INIT;
  }
}

// ============================================================
// Sentinel Marker (Layer 2 Fallback)
// ============================================================

/** Unique sentinel marker using readline invisible characters */
export const SENTINEL_MARKER = '\x01\x02REPTERM_READY\x01\x02';

/** Check if text contains the sentinel marker */
export function containsSentinel(text: string): boolean {
  return text.includes(SENTINEL_MARKER);
}

// ============================================================
// Enhanced ANSI Stripping
// ============================================================

/**
 * Strip ANSI/terminal escape sequences from text.
 * Handles CSI, OSC (including hyperlinks), DCS, APC, PM, readline markers.
 */
export function stripAnsiEnhanced(text: string): string {
  return text.replace(
    // CSI sequences: \x1b[...X
    // OSC sequences: \x1b]...\x07 or \x1b]...\x1b\\
    // DCS sequences: \x1bP...\x1b\\
    // APC sequences: \x1b_...\x1b\\
    // PM sequences:  \x1b^...\x1b\\
    // Character set: \x1b(X \x1b)X
    // Mode set:      \x1b= \x1b>
    // CSI with ? prefix: \x1b[?...X
    // Readline markers: \x01...\x02
    /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[=>]|\x1bP[^\x1b]*\x1b\\|\x1b_[^\x1b]*\x1b\\|\x1b\^[^\x1b]*\x1b\\|\x01[^\x02]*\x02/g,
    ''
  );
}

// ============================================================
// Shell Integration Config Types
// ============================================================

export interface ShellIntegrationConfig {
  /** Enable shell integration (default: true) */
  enabled?: boolean;
  /** Enable sentinel fallback (default: true) */
  sentinelFallback?: boolean;
  /** Custom shell path override */
  shell?: string;
}
