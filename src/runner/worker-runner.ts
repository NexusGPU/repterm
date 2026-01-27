/**
 * Worker runner script
 * Executed in worker process to run tests
 */

import type { TestSuite } from './models.js';
import type { RunConfig } from './config.js';
import { runSuite } from './runner.js';
import { ArtifactManager } from './artifacts.js';

interface WorkerMessage {
  type: string;
  data?: {
    suite: TestSuite;
    config: RunConfig;
    artifactBaseDir: string;
  };
}

/**
 * Handle messages from parent process
 */
process.on('message', async (message: WorkerMessage) => {
  if (message.type === 'run' && message.data) {
    try {
      const { suite, config, artifactBaseDir } = message.data;

      // Create artifact manager for this worker
      const artifactManager = new ArtifactManager({
        baseDir: artifactBaseDir,
        runId: `worker-${process.pid}-${Date.now()}`,
      });
      artifactManager.init();

      // Run the suite
      const results = await runSuite(suite, {
        config,
        artifactManager,
        onResult: (result) => {
          process.send?.({
            type: 'result',
            data: result,
          });
        },
      });

      // Send results back to parent
      process.send?.({
        type: 'done',
        data: results,
      });
    } catch (error) {
      // Send error back to parent
      process.send?.({
        type: 'error',
        data: {
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      });
    }
  }
});

// Signal ready
process.send?.({ type: 'ready' });
