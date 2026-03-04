/**
 * Example 21: Multi-pane Watch + Interrupt
 *
 * Tests the same pattern as tensor-fusion test 03:
 * - Start a long-running process in pane 0 (simulates kubectl get -w)
 * - Create pane 1 via terminal.create()
 * - Run and AWAIT multiple commands in pane 1
 * - Interrupt the long-running process in pane 0
 * - Verify pane 0 recovers and can run new commands
 *
 * Run: bun run repterm --record examples/21-multi-pane-watch.ts
 */

import { test, expect, describe } from 'repterm';

describe('Multi-pane Watch + Await', { record: true }, () => {
  test('Watch in pane 0, await commands in pane 1, then interrupt', async ({ $, terminal }) => {
    // 1. Start a long-running process in pane 0 (simulates kubectl get -w)
    const watchProc = terminal.run('while true; do date; sleep 1; done');
    await watchProc.start();

    // 2. Create pane 1
    const terminal2 = await terminal.create();

    // 3. Run commands in pane 1 and AWAIT results (triggers waitForOutputStable)
    const result1 = await terminal2.$`echo "hello from pane 1"`;
    expect(result1).toHaveStdout('hello from pane 1');

    const result2 = await terminal2.$`echo "world"`;
    expect(result2).toHaveStdout('world');

    const result3 = await terminal2.$`date +%Y`;
    expect(result3).toContainInOutput('202');

    // 4. Observe for a period (simulates watching kubectl output)
    await Bun.sleep(2000);

    // 5. Interrupt pane 0's long-running process
    await watchProc.interrupt();

    // 6. Run command in pane 0 to verify recovery
    const result4 = await $`echo "back to pane 0"`;
    expect(result4).toHaveStdout('back to pane 0');
  });
});
