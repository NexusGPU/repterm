/**
 * Example 8: Recording Demo
 *
 * This is a recording test example marked with { record: true }
 * Only runs when using the --record parameter
 *
 * Run: bun run repterm --record examples/08-recording-demos.ts
 *
 * Notes:
 * - Recording mode requires asciinema and tmux to be installed
 * - In recording mode exitCode is unreliable, use output assertions instead
 */

import { test, expect, describe } from 'repterm';

describe('Recording Demo', { record: true }, () => {
  test('Basic command demo', async ({ $, terminal }) => {
    // In recording mode, commands are recorded to .cast file
    await $`echo "Welcome to Repterm Test Framework"`;
    await expect(terminal).toContainText('Welcome');
  });

  test('Multi-command demo', async ({ $ }) => {
    await $`pwd`;
    await $`ls -la`;
    await $`echo "Demo completed"`;
  });
});

// Independent recording test
test('Independent recording test', { record: true }, async ({ $ }) => {
  await $`echo "This is an independent recording test"`;
  await $`date`;
});

// Regular test (not marked with record: true)
// This test only runs when not using --record
describe('Regular Functional Test', () => {
  test('Verify exit code', async ({ $ }) => {
    const result = await $`echo "success"`;
    expect(result).toSucceed();
    console.log(`  Exit code: ${result.code}`);
  });
});
