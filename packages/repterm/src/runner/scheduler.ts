/**
 * Scheduler + aggregation for parallel test execution
 * Distributes tests across workers and aggregates results
 */

import type { TestSuite, RunResult } from './models.js';
import type { RunConfig } from './config.js';
import { createWorker, Worker } from './worker.js';

export interface SchedulerOptions {
  config: RunConfig;
  artifactBaseDir: string;
  onResult?: (result: RunResult) => void;
}

/**
 * Parallel test scheduler
 */
export class Scheduler {
  private options: SchedulerOptions;
  private workers: Worker[] = [];
  private results: RunResult[] = [];
  private pendingSuites: TestSuite[] = [];
  private activeSuites = 0;

  constructor(options: SchedulerOptions) {
    this.options = options;
  }

  /**
   * Run test suites in parallel across workers
   */
  async run(suites: TestSuite[]): Promise<RunResult[]> {
    const workerCount = this.options.config.parallel.workers;

    if (workerCount === 1) {
      // Single worker mode - run sequentially (already handled by caller)
      throw new Error('Scheduler should not be used for single worker');
    }

    // Initialize workers
    await this.initWorkers(workerCount);

    // Queue all suites
    this.pendingSuites = [...suites];
    this.results = [];
    this.activeSuites = 0;

    // Start distributing work
    await this.distributeSuites();

    // Wait for all work to complete
    await this.waitForCompletion();

    // Cleanup workers
    this.cleanupWorkers();

    return this.results;
  }

  /**
   * Initialize worker pool
   */
  private async initWorkers(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const worker = createWorker({
        workerId: i,
        config: this.options.config,
        artifactBaseDir: this.options.artifactBaseDir,
      });

      // Set up event handlers
      worker.on('done', (results: RunResult[]) => {
        this.handleWorkerDone(worker, results);
      });

      worker.on('result', (result: RunResult) => {
        this.options.onResult?.(result);
      });

      worker.on('error', (error: Error) => {
        this.handleWorkerError(worker, error);
      });

      this.workers.push(worker);
      worker.start();
    }

    // Wait for all workers to be ready
    await this.waitForWorkers();
  }

  /**
   * Wait for all workers to signal ready
   */
  private waitForWorkers(): Promise<void> {
    return new Promise((resolve) => {
      let readyCount = 0;
      const targetCount = this.workers.length;

      for (const worker of this.workers) {
        worker.once('ready', () => {
          readyCount++;
          if (readyCount === targetCount) {
            resolve();
          }
        });
      }
    });
  }

  /**
   * Distribute suites to available workers
   */
  private async distributeSuites(): Promise<void> {
    for (const worker of this.workers) {
      if (this.pendingSuites.length === 0) {
        break;
      }

      if (!worker.isBusy()) {
        const suite = this.pendingSuites.shift();
        if (suite) {
          this.activeSuites++;
          worker.runSuite(suite);
        }
      }
    }
  }

  /**
   * Handle worker completion
   */
  private handleWorkerDone(worker: Worker, results: RunResult[]): void {
    this.results.push(...results);
    this.activeSuites--;

    // Assign next suite if available
    if (this.pendingSuites.length > 0) {
      const suite = this.pendingSuites.shift();
      if (suite) {
        this.activeSuites++;
        worker.runSuite(suite);
      }
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(worker: Worker, error: Error): void {
    console.error(`Worker ${worker.getWorkerId()} error:`, error);
    this.activeSuites--;

    // Try to assign next suite to another worker
    this.distributeSuites();
  }

  /**
   * Wait for all work to complete
   */
  private waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (this.activeSuites === 0 && this.pendingSuites.length === 0) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }

  /**
   * Cleanup worker pool
   */
  private cleanupWorkers(): void {
    for (const worker of this.workers) {
      worker.stop();
    }
    this.workers = [];
  }
}

/**
 * Create a scheduler
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  return new Scheduler(options);
}
