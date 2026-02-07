/**
 * Example 4: Using Hooks for Fixtures (Lazy Loading)
 *
 * Run: bun src/cli/index.ts examples/04-fixtures-with-hooks.ts
 *
 * Note: Run this example independently, don't run with other examples, since hooks are globally shared
 */

import { test, expect, describe, beforeEach, afterEach } from '../src/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Temporary Directory Fixture', () => {
  // Register 'tmpDir' fixture
  // Only executes if tmpDir is requested in test parameters
  beforeEach('tmpDir', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repterm-example-'));
    console.log(`  [Setup] Created: ${tmpDir}`);
    return { tmpDir };
  });

  // Corresponding afterEach also needs to specify name
  // Only executes cleanup if beforeEach was executed
  afterEach('tmpDir', async (ctx) => {
    const tmpDir = ctx.tmpDir as string | undefined;
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true }).catch(() => { });
      console.log(`  [Cleanup] Removed: ${tmpDir}`);
    }
  });

  test('Create file in temporary directory', async ({ terminal, tmpDir }) => {
    const result = await terminal.run(`touch ${tmpDir}/test.txt && ls ${tmpDir}`);
    expect(result).toSucceed();
    expect(result).toHaveStdout('test.txt');
  });

  test('Not running before/after', async ({ terminal }) => {
    // This test doesn't need tmpDir, so beforeEach/afterEach won't be triggered
    console.log('  [Test] This test will not trigger tmpDir fixture');
    await terminal.run('echo "Hello World"');
  });

  test('Write and read file in temporary directory', async ({ terminal, tmpDir }) => {
    await terminal.run(`echo "Hello World" > ${tmpDir}/hello.txt`);

    const readResult = await terminal.run(`cat ${tmpDir}/hello.txt`);
    expect(readResult).toSucceed();
    expect(readResult).toHaveStdout('Hello World');
