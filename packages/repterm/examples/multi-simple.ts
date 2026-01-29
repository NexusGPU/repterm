/**
 * Simple multi-terminal test
 */
import { test, expect } from 'repterm';

test('multi-terminal: basic test', async ({ terminal }) => {
  // Terminal 1: Create a file
  await terminal.start('echo "test1" > /tmp/multi-test.txt');
  await terminal.waitForText('test1', { timeout: 5000 });
  await terminal.start('cat /tmp/multi-test.txt');

  // Terminal 2: Read the file (直接从 terminal 创建)
  const terminal2 = await terminal.create();
  await terminal2.start('cat /tmp/multi-test.txt');
  await terminal2.waitForText('test1', { timeout: 5000 });
  await expect(terminal2).toContainText('test1');

  await terminal.start('echo "test2" >> /tmp/multi-test.txt');
  await terminal.waitForText('test2', { timeout: 5000 });

  await terminal2.start('cat /tmp/multi-test.txt');
  await terminal2.waitForText('test2', { timeout: 5000 });
  await expect(terminal2).toContainText('test2');

});
