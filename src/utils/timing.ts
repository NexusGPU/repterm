/**
 * Timing utilities for performance tracking
 * Provides high-resolution timing measurements
 */

/**
 * Timer for measuring execution time
 */
export class Timer {
  private startTime: number;
  private endTime: number | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Stop the timer and return duration
   */
  stop(): number {
    this.endTime = Date.now();
    return this.duration();
  }

  /**
   * Get elapsed time without stopping
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get duration (stopped time)
   */
  duration(): number {
    if (this.endTime === null) {
      throw new Error('Timer not stopped');
    }
    return this.endTime - this.startTime;
  }

  /**
   * Check if timer is running
   */
  isRunning(): boolean {
    return this.endTime === null;
  }
}

/**
 * Create and start a new timer
 */
export function createTimer(): Timer {
  return new Timer();
}

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const timer = createTimer();
  const result = await fn();
  const duration = timer.stop();
  return { result, duration };
}

/**
 * Measure execution time of a sync function
 */
export function measure<T>(fn: () => T): { result: T; duration: number } {
  const timer = createTimer();
  const result = fn();
  const duration = timer.stop();
  return { result, duration };
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return Bun.sleep(ms);
}
