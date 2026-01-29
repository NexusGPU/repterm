/**
 * Asciinema recording mode implementation
 * Manages asciinema session control and artifacts
 */

import { EventEmitter } from 'events';
import { type Subprocess } from 'bun';

export interface RecorderConfig {
  castFile: string;
  cols?: number;
  rows?: number;
  command?: string;
}

/**
 * Asciinema recorder wrapper
 */
export class Recorder extends EventEmitter {
  private process: Subprocess | null = null;
  private config: RecorderConfig;
  private recording = false;

  constructor(config: RecorderConfig) {
    super();
    this.config = config;
  }

  /**
   * Start recording
   */
  start(): void {
    if (this.recording) {
      throw new Error('Recording already started');
    }

    const args = ['rec', this.config.castFile];

    // Add dimensions if specified
    if (this.config.cols && this.config.rows) {
      args.push('--cols', this.config.cols.toString());
      args.push('--rows', this.config.rows.toString());
    }

    // Add command if specified
    if (this.config.command) {
      args.push('--command', this.config.command);
    }

    try {
      // Start asciinema using Bun.spawn
      this.process = Bun.spawn(['asciinema', ...args], {
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      });

      this.recording = true;

      // Handle exit
      // Bun.spawn doesn't have .on('exit'), use .exited promise
      this.process.exited.then((code) => {
        this.recording = false;
        this.emit('exit', code);
      }).catch((err) => {
        console.error("Error waiting for process exit:", err);
      });

    } catch (error) {
      this.recording = false;
      this.emit('error', error);
    }
  }

  /**
   * Stop recording
   */
  stop(): void {
    if (!this.recording || !this.process) {
      return;
    }

    this.process.kill('SIGTERM');
    this.recording = false;
    // Note: The 'exit' event will be emitted by the .exited handler in start()
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get the cast file path
   */
  getCastFile(): string {
    return this.config.castFile;
  }
}

/**
 * Create a recorder instance
 */
export function createRecorder(config: RecorderConfig): Recorder {
  return new Recorder(config);
}

/**
 * Check if asciinema is available
 */
export async function checkAsciinemaAvailable(): Promise<boolean> {
  const proc = Bun.spawn(['which', 'asciinema'], {
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await proc.exited;
  return proc.exitCode === 0;
}
