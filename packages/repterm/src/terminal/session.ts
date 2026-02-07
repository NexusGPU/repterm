/**
 * Terminal session abstraction around bun-pty
 * Provides core PTY operations for terminal interaction
 */

import { spawn, type IPty } from 'bun-pty';
import { EventEmitter } from 'events';

export interface SessionConfig {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

export interface SessionOptions extends SessionConfig {
  shell?: string;
  args?: string[]; // Arguments to pass to shell/command
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * Terminal session wrapper around bun-pty
 */
export class TerminalSession extends EventEmitter {
  private pty: IPty | null = null;
  private outputBuffer: string = '';
  private config: SessionConfig;

  constructor(config: SessionConfig = {}) {
    super();

    // Convert process.env to Record<string, string> by filtering undefined values
    let env: Record<string, string> = {};
    if (config.env) {
      env = config.env;
    } else {
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    this.config = {
      cols: config.cols ?? DEFAULT_COLS,
      rows: config.rows ?? DEFAULT_ROWS,
      env,
    };
  }

  /**
   * Start the terminal session
   */
  start(options: SessionOptions = {}): void {
    if (this.pty) {
      throw new Error('Terminal session already started');
    }

    const shell = options.shell ?? process.env.SHELL ?? '/bin/bash';
    const args = options.args ?? [];

    // Merge environment variables, filtering out undefined values
    const mergedEnv = { ...this.config.env, ...options.env };
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(mergedEnv)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Ensure TERM is set to xterm-256color for proper color support
    if (!env.TERM) {
      env.TERM = 'xterm-256color';
    }

    this.pty = spawn(shell, args, {
      name: 'xterm-256color',  // Support 256 colors (like simple-example.js)
      cols: options.cols ?? this.config.cols ?? DEFAULT_COLS,
      rows: options.rows ?? this.config.rows ?? DEFAULT_ROWS,
      cwd: process.cwd(),
      env,
    });

    // Capture output
    this.pty.onData((data) => {
      this.outputBuffer += data;
      this.emit('data', data);
    });

    // Handle exit
    this.pty.onExit(({ exitCode, signal }) => {
      this.emit('exit', { exitCode, signal });
    });
  }

  /**
   * Write data to the terminal
   */
  write(data: string): void {
    if (!this.pty) {
      throw new Error('Terminal session not started');
    }
    this.pty.write(data);
  }

  /**
   * Get the current output buffer
   */
  getOutput(): string {
    return this.outputBuffer;
  }

  /**
   * Clear the output buffer
   */
  clearOutput(): void {
    this.outputBuffer = '';
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    if (!this.pty) {
      throw new Error('Terminal session not started');
    }
    this.pty.resize(cols, rows);
  }

  /**
   * Kill the terminal process
   */
  kill(signal?: string): void {
    if (this.pty) {
      this.pty.kill(signal);
      this.pty = null;
    }
  }

  /**
   * Check if the session is active
   */
  isActive(): boolean {
    return this.pty !== null;
  }

  /**
   * Get the process ID
   */
  getPid(): number | undefined {
    return this.pty?.pid;
  }
}
