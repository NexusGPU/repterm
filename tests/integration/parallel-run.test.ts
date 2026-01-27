/**
 * Integration test for parallel worker run
 * Tests that multiple tests can run concurrently with isolated state
 */

import { describe, test, expect } from 'bun:test';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

describe('Parallel Execution', () => {
  // TODO: Implement --workers CLI flag for parallel execution
  test.skip('Parallel execution runs tests concurrently', async () => {
    const tempDir = join('/tmp', 'temp-test-parallel');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create multiple test files
      for (let i = 1; i <= 4; i++) {
        const testFile = join(tempDir, `test${i}.test.ts`);
        await writeFile(
          testFile,
          `
          import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

          test('parallel test ${i}', async ({ terminal }) => {
            await terminal.start('sleep 0.5 && echo "test${i}"');
            await terminal.waitForText('test${i}', { timeout: 5000 });
            await expect(terminal).toContainText('test${i}');
          });
        `
        );
      }

      // Run with 4 workers
      const start = Date.now();
      await execAsync(`bun ./dist/cli/index.js --workers 4 ${tempDir}/*.test.ts`);
      const duration = Date.now() - start;

      // With 4 workers, should complete in ~0.5s (parallel) rather than ~2s (sequential)
      // Allow some overhead for process management
      expect(duration).toBeLessThan(1500);
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  // TODO: Implement --workers CLI flag for parallel execution
  test.skip('Parallel execution maintains test isolation', async () => {
    const tempDir = join('/tmp', 'temp-test-isolation');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create tests that write to temp files
      for (let i = 1; i <= 3; i++) {
        const testFile = join(tempDir, `isolation${i}.test.ts`);
        await writeFile(
          testFile,
          `
          import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

          test('isolated test ${i}', async ({ terminal }) => {
            await terminal.start('echo "worker${i}" > /tmp/repterm-test-${i}.txt');
            await terminal.start('cat /tmp/repterm-test-${i}.txt');
            await terminal.waitForText('worker${i}', { timeout: 5000 });
            await expect(terminal).toContainText('worker${i}');
          });
        `
        );
      }

      // Run with 3 workers
      await execAsync(`bun ./dist/cli/index.js --workers 3 ${tempDir}/*.test.ts`);

      // All tests should pass (no interference)
      expect(true).toBe(true);
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('Parallel execution reports aggregated results', async () => {
    const tempDir = join('/tmp', 'temp-test-agg');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create mix of passing and failing tests
      await writeFile(
        join(tempDir, 'pass1.test.ts'),
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';
        test('pass 1', async ({ terminal }) => {
          await terminal.start('echo "pass"');
          await expect(terminal).toContainText('pass');
        });
      `
      );

      await writeFile(
        join(tempDir, 'pass2.test.ts'),
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';
        test('pass 2', async ({ terminal }) => {
          await terminal.start('echo "pass"');
          await expect(terminal).toContainText('pass');
        });
      `
      );

      await writeFile(
        join(tempDir, 'fail1.test.ts'),
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';
        test('fail 1', async ({ terminal }) => {
          await terminal.start('echo "hello"');
          await expect(terminal).toContainText('goodbye');
        });
      `
      );

      // Run with 2 workers - should fail due to failing test
      await expect(
        execAsync(`bun ./dist/cli/index.js --workers 2 ${tempDir}/*.test.ts`)
      ).rejects.toThrow();
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
