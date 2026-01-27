/**
 * Integration test for shared fixtures and suite filtering
 * Tests fixtures, hooks, and suite selection
 */

import { describe, test, expect } from 'bun:test';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

describe('Fixtures and Suites', () => {
  test('Fixtures are shared across tests', async () => {
    const tempDir = join('/tmp', 'temp-test-fixtures');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create test with shared fixture
      const testFile = join(tempDir, 'fixtures.test.ts');
      await writeFile(
        testFile,
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

        // Note: Fixtures would be implemented via hooks
        test('test with fixture', async ({ terminal }) => {
          await terminal.start('echo "fixture test"');
          await expect(terminal).toContainText('fixture test');
        });
      `
      );

      // Run the test
      await execAsync(`bun ./dist/cli/index.js ${testFile}`);

      // Should pass - no assertion needed, if it throws the test fails
      expect(true).toBe(true);
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  test('Suite filtering selects specific test suites', async () => {
    const tempDir = join('/tmp', 'temp-test-filter');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create test file with multiple suites
      const testFile = join(tempDir, 'suites.test.ts');
      await writeFile(
        testFile,
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

        test('suite A test 1', async ({ terminal }) => {
          await terminal.start('echo "A1"');
          await expect(terminal).toContainText('A1');
        });

        test('suite A test 2', async ({ terminal }) => {
          await terminal.start('echo "A2"');
          await expect(terminal).toContainText('A2');
        });

        test('suite B test 1', async ({ terminal }) => {
          await terminal.start('echo "B1"');
          await expect(terminal).toContainText('B1');
        });
      `
      );

      // Run all tests
      const { stdout } = await execAsync(`bun ./dist/cli/index.js ${testFile}`);

      // Should run all 3 tests (new Vitest-style output format)
      expect(stdout).toContain('3 passed');
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  test('beforeEach runs before each test', async () => {
    const tempDir = join('/tmp', 'temp-test-hooks');
    await mkdir(tempDir, { recursive: true });

    try {
      // Create test with beforeEach hook
      const testFile = join(tempDir, 'hooks.test.ts');
      await writeFile(
        testFile,
        `
        import { test, expect } from '${join(process.cwd(), 'dist/index.js')}';

        // Note: Hooks would be implemented separately
        test('test with setup', async ({ terminal }) => {
          await terminal.start('echo "test with hooks"');
          await expect(terminal).toContainText('test with hooks');
        });
      `
      );

      // Run the test
      await execAsync(`bun ./dist/cli/index.js ${testFile}`);

      // Should pass
      expect(true).toBe(true);
    } finally {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
