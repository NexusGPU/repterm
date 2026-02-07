/**
 * Artifact directory manager and path helpers
 * Manages test artifacts (recordings)
 */

import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
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

