/**
 * Example 3: Interactive commands
 *
 * Run: bun run repterm examples/03-interactive-commands.ts
 *
 * Interactive commands require { interactive: true }. In interactive mode
 * exitCode is unreliable; use output assertions instead.
 */

import { test, expect, describe } from 'repterm';

describe('Interactive commands', () => {
  test('run interactive command with interactive option', async ({ terminal }) => {
    // { interactive: true } enables expect/send
    const proc = terminal.run('echo "step 1"; sleep 0.1; echo "step 2"', { interactive: true });

    await proc.expect('step 1');
    console.log('  Step 1 completed');

    const result = await proc;
    // In interactive mode result.code is unreliable (-1); assert on output
    expect(result).toContainInOutput('step 2');
  });
});

describe('PTYProcess PromiseLike behavior', () => {
  test('PTYProcess can be awaited (non-interactive)', async ({ terminal }) => {
    // Non-interactive: Bun.spawn, exact exitCode
    const result = await terminal.run('echo test');
    expect(result).toSucceed();
    console.log(`  Exit code: ${result.code}`);
  });

  test('PTYProcess supports .finally', async ({ terminal }) => {
    let cleanupCalled = false;

    const result = await terminal.run('echo test').finally(() => {
      cleanupCalled = true;
    });

    expect(result).toSucceed();
    if (!cleanupCalled) {
      throw new Error('Expected cleanupCalled to be true');
    }
  });

  test('non-interactive mode yields separate stdout/stderr', async ({ terminal }) => {
    const result = await terminal.run('echo "stdout" && echo "stderr" >&2');
    
    console.log(`  stdout: ${result.stdout.trim()}`);
    console.log(`  stderr: ${result.stderr.trim()}`);
    
    if (!result.stdout.includes('stdout')) {
      throw new Error('Expected stdout to contain "stdout"');
    }
    if (!result.stderr.includes('stderr')) {
      throw new Error('Expected stderr to contain "stderr"');
    }
  });
});
