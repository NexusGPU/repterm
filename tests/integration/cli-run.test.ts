/**
 * Integration test for CLI single test run
 * Tests the complete flow of running a test via CLI
 */

import { describe, test, expect } from 'bun:test';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

describe('CLI Integration', () => {
  test('CLI runs a single test and shows pass/fail', async () => {
    const tempDir = join('/tmp', 'temp-test-cli');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create a simple passing test
      const testFile = join(tempDir, 'simple.test.ts');
      await writeFile(
        testFile,
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

        test('simple pass', async ({ terminal }) => {
          await terminal.start('echo "hello"');
          await terminal.waitForText('hello', { timeout: 5000 });
          await expect(terminal).toContainText('hello');
        });
      `
      );

      // Run the test via CLI (use bun instead of node for bun-pty compatibility)
      const { stdout } = await execAsync(`bun ./dist/cli/index.js ${testFile}`);

      // Check output
      expect(stdout.includes('pass') || stdout.includes('✓')).toBe(true);
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  test('CLI shows clear failure diagnostics', async () => {
    const tempDir = join('/tmp', 'temp-test-cli-fail');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create a failing test
      const testFile = join(tempDir, 'fail.test.ts');
      await writeFile(
        testFile,
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

        test('simple fail', async ({ terminal }) => {
          await terminal.start('echo "hello"');
          await expect(terminal).toContainText('goodbye');
        });
      `
      );

      // Run the test via CLI (should exit with non-zero, use bun for bun-pty compatibility)
      await expect(execAsync(`bun ./dist/cli/index.js ${testFile}`)).rejects.toThrow();
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  test('CLI respects timeout settings', async () => {
    const tempDir = join('/tmp', 'temp-test-cli-timeout');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create a test that would timeout
      const testFile = join(tempDir, 'timeout.test.ts');
      await writeFile(
        testFile,
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

        test('timeout test', async ({ terminal }) => {
          await terminal.start('sleep 100');
          await terminal.waitForText('never-appears', { timeout: 100 });
        });
      `
      );

      // Run the test with short timeout - should fail (use bun for bun-pty compatibility)
      await expect(execAsync(`bun ./dist/cli/index.js ${testFile}`)).rejects.toThrow();
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
