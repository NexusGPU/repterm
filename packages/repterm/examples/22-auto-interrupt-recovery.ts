/**
 * Example 22: Auto-Interrupt Recovery
 *
 * Tests the exact failure scenario from tensor-fusion test 03:
 * - Start a long-running process in pane 0
 * - Create pane 1 and run commands
 * - Simulate a test failure (skip watchProc.interrupt())
 * - Run a NEW command on pane 0 — ensurePromptReadyForNextCommand()
 *   should auto-detect the running process, send C-c, and recover.
 *
 * Run: bun run repterm --record examples/22-auto-interrupt-recovery.ts
 */

import { test, expect, describe } from 'repterm';

describe('Auto-interrupt recovery', { record: true }, () => {
  test('Should auto-interrupt foreground process when typing new command', async ({ $, terminal }) => {
    // 1. Start a long-running process in pane 0 (simulates kubectl get -w)
    const watchProc = terminal.run('while true; do date; sleep 1; done');
    await watchProc.start();

    // 2. Create pane 1
    const terminal2 = await terminal.create();

    // 3. Run commands in pane 1 (simulates kubectl2 queries)
    const result1 = await terminal2.$`echo "query from pane 1"`;
    expect(result1).toHaveStdout('query from pane 1');

    const result2 = await terminal2.$`echo "second query"`;
    expect(result2).toHaveStdout('second query');

    // 4. DO NOT call watchProc.interrupt() — simulates test assertion failure
    //    that skips the interrupt call.

    // 5. Directly run a command on pane 0 — the framework should auto-detect
    //    the running watch and interrupt it before typing the new command.
    const result3 = await $`echo "recovered pane 0"`;
    expect(result3).toHaveStdout('recovered pane 0');

    // 6. Run another command to confirm pane 0 is fully recovered
    const result4 = await $`echo "all good"`;
    expect(result4).toHaveStdout('all good');
  });
});
