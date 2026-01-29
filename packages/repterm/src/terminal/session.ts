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

/**
 * Create a new terminal session
 */
export function createSession(config?: SessionConfig): TerminalSession {
  return new TerminalSession(config);
}

/**
 * 命令执行结果（内部使用）
 */
export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * 执行命令并返回分离的 stdout/stderr（非 PTY 模式）
 * 用于非录制、非交互式场景
 */
export async function runCommand(
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): Promise<RunCommandResult> {
  const timeout = options.timeout ?? 30000;
  const cwd = options.cwd ?? process.cwd();

  // 构建环境变量
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  const proc = Bun.spawn(['sh', '-c', command], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
    env,
  });

  // 设置超时
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
    }, timeout);
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    return {
      code: exitCode,
      stdout,
      stderr,
    };
  } finally {
    // 清除超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    // 确保进程被清理
    if (proc.exitCode === null) {
      proc.kill();
    }
  }
}
