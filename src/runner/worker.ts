/**
 * Worker process runner for parallel test execution
 * Runs tests in isolated worker processes
 */

import { fork, type ChildProcess } from 'child_process';
import type { TestSuite } from './models.js';
import type { RunConfig } from './config.js';
import { EventEmitter } from 'events';

export interface WorkerConfig {
  workerId: number;
  config: RunConfig;
  artifactBaseDir: string;
}

export interface WorkerMessage {
  type: 'ready' | 'result' | 'error' | 'done';
  data?: unknown;
}

/**
 * Worker process manager
 */
export class Worker extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: WorkerConfig;
  private busy = false;

  constructor(config: WorkerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the worker process
   */
  start(): void {
    if (this.process) {
      throw new Error('Worker already started');
    }

    // Fork a new process running the worker script
    this.process = fork(new URL('./worker-runner.js', import.meta.url).pathname, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // Handle messages from worker
    this.process.on('message', (message: WorkerMessage) => {
      this.handleMessage(message);
    });

    // Handle worker exit
    this.process.on('exit', (code) => {
      this.emit('exit', code);
    });

    // Handle worker errors
    this.process.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Run a test suite in the worker
   */
  runSuite(suite: TestSuite): void {
    if (!this.process) {
      throw new Error('Worker not started');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;

    // Send suite to worker
    this.process.send({
      type: 'run',
      data: {
        suite,
        config: this.config.config,
        artifactBaseDir: this.config.artifactBaseDir,
      },
    });
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Check if worker is busy
   */
  isBusy(): boolean {
    return this.busy;
  }

  /**
   * Get worker ID
   */
  getWorkerId(): number {
    return this.config.workerId;
  }

  /**
   * Handle message from worker
   */
  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'ready':
        this.emit('ready');
        break;

      case 'result':
        this.emit('result', message.data);
        break;

      case 'done':
        this.busy = false;
        this.emit('done', message.data);
        break;

      case 'error':
        this.busy = false;
        this.emit('error', message.data);
        break;
    }
  }
}

/**
 * Create a worker
 */
export function createWorker(config: WorkerConfig): Worker {
  return new Worker(config);
}
