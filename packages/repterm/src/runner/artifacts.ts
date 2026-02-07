/**
 * Artifact directory manager and path helpers
 * Manages test artifacts (recordings, logs, snapshots)
 */

import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';

export interface ArtifactConfig {
  baseDir: string;
  runId: string;
}

export class ArtifactManager {
  private baseDir: string;
  private runId: string;
  private runDir: string;

  constructor(config: ArtifactConfig) {
    this.baseDir = config.baseDir;
    this.runId = config.runId;
    this.runDir = join(this.baseDir, this.runId);
  }

  /**
   * Initialize artifact directory structure
   */
  init(): void {
    if (!existsSync(this.runDir)) {
      mkdirSync(this.runDir, { recursive: true });
    }
  }

  /**
   * Get path for a cast recording artifact
   */
  getCastPath(testId: string): string {
    return join(this.runDir, `${testId}.cast`);
  }

  /**
   * Get path for a log artifact
   */
  getLogPath(testId: string): string {
    return join(this.runDir, `${testId}.log`);
  }

  /**
   * Get path for a snapshot artifact
   */
  getSnapshotPath(testId: string, snapshotIndex: number): string {
    return join(this.runDir, `${testId}-snapshot-${snapshotIndex}.txt`);
  }

  /**
   * Get the run directory path
   */
  getRunDir(): string {
    return this.runDir;
  }

  /**
   * Get the base artifacts directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Get the run ID
   */
  getRunId(): string {
    return this.runId;
  }

  /**
   * Ensure a directory exists
   */
  static ensureDir(path: string): void {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Create artifact manager for a new run
 */
export function createArtifactManager(baseDir: string = '/tmp/repterm'): ArtifactManager {
  const runId = generateRunId();
  return new ArtifactManager({ baseDir, runId });
}

