/**
 * Example 20: Timeouts and Error Handling
 *
 * Run: bun run repterm examples/20-timeouts-and-errors.ts
 *
 * Demonstrates timeout configuration and error handling patterns:
 * - Test-level timeout: test('name', { timeout: X }, fn)
 * - Command timeout: $({ timeout: X })`cmd`
 * - expect() timeout: proc.expect('text', { timeout: X })
 * - wait() timeout: proc.wait({ timeout: X })
 * - Error recovery with try/catch
 * - PTYProcess.catch() for promise-style error handling
 * - result.successful for conditional logic
 */

import { test, expect, describe, raw } from 'repterm';

describe('Test-level timeout', () => {
  test('generous timeout for slow tests', { timeout: 10000 }, async ({ $ }) => {
    // This test has a 10-second timeout (default is 30s)
    const result = await $`sleep 0.2 && echo "completed within timeout"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('completed within timeout');
    console.log(`  test completed in ${result.duration}ms (timeout: 10000ms)`);
  });

  test('tight timeout — test passes quickly', { timeout: 5000 }, async ({ $ }) => {
    const result = await $`echo "fast"`;
    expect(result).toSucceed();
    console.log(`  fast test: ${result.duration}ms`);
  });
});

describe('Command timeout', () => {
  test('command completes within timeout', async ({ $ }) => {
    // Set a generous command timeout
    const result = await $({ timeout: 5000 })`echo "quick"`;
    expect(result).toSucceed();
    console.log(`  command completed: ${result.duration}ms`);
  });

  test('command timeout kills slow process', async ({ $ }) => {
    // Short timeout on a slow command — will be killed
    try {
      await $({ timeout: 500 })`sleep 30`;
      // If we get here, command was killed and returned a result
      console.log(`  command killed by timeout (returned result)`);
    } catch (e) {
      // Some implementations throw on timeout
      console.log(`  command timeout error: ${(e as Error).message.slice(0, 60)}`);
    }
  });
});

describe('expect() timeout', () => {
  test('expect finds text before timeout', async ({ $ }) => {
    const proc = $({ interactive: true })`bash -c 'sleep 0.2; echo "appeared"'`;
    await proc.start();

    // Text appears within the timeout window
    await proc.expect('appeared', { timeout: 5000 });
    console.log(`  text found within timeout`);
  });

  test('expect timeout when text never appears', async ({ $ }) => {
    const proc = $({ interactive: true })`echo "hello"`;
    await proc.start();

    try {
      // Wait for text that will never appear
      await proc.expect('nonexistent-marker-xyz', { timeout: 1000 });
      // Should not reach here
      expect(true).toBe(false);
    } catch (e) {
      // expect() throws when timeout is exceeded
      const msg = (e as Error).message;
      console.log(`  expect timeout caught: ${msg.slice(0, 60)}`);
    }
  });
});

describe('wait() with timeout', () => {
  test('wait completes before timeout', async ({ $ }) => {
    const proc = $({ interactive: true })`echo "done"`;
    const result = await proc.wait({ timeout: 5000 });
    expect(result).toContainInOutput('done');
    console.log(`  wait completed: ${result.duration}ms`);
  });
});

describe('Error recovery patterns', () => {
  test('result.successful for conditional logic', async ({ $ }) => {
    const success = await $`echo "ok"`;
    const failure = await $`exit 1`;

    // Use result.successful instead of try/catch
    if (success.successful) {
      console.log(`  success path: code=${success.code}`);
    }
    if (!failure.successful) {
      console.log(`  failure path: code=${failure.code}`);
    }

    expect(success.successful).toBe(true);
    expect(failure.successful).toBe(false);
  });

  test('check exit code for specific errors', async ({ $ }) => {
    const result = await $`bash -c 'exit 42'`;
    expect(result).toHaveExitCode(42);

    // Switch on exit code for different error types
    switch (result.code) {
      case 0: console.log('  success'); break;
      case 1: console.log('  general error'); break;
      case 42: console.log('  custom error (42)'); break;
      case 127: console.log('  command not found'); break;
      default: console.log(`  unexpected: ${result.code}`);
    }
  });

  test('stderr inspection for error details', async ({ $ }) => {
    const result = await $`bash -c 'echo "error: file not found" >&2; exit 1'`;
    expect(result).toFail();
    expect(result).toHaveStderr('error: file not found');
    console.log(`  stderr: ${result.stderr.trim()}`);
  });

  test('PTYProcess.catch() for promise-style error handling', async ({ $ }) => {
    // .catch() on PTYProcess works like Promise.catch()
    const result = await $({ timeout: 500 })`sleep 30`
      .catch((e: unknown) => {
        console.log(`  caught via .catch(): ${(e as Error).message.slice(0, 50)}`);
        return null;
      });

    if (result) {
      // Timeout returned a result instead of throwing
      console.log(`  process killed, code: ${result.code}`);
    }
  });

  test('sequential error recovery — failures don\'t affect next commands', async ({ $ }) => {
    const r1 = await $`exit 1`;
    expect(r1).toFail();

    // Next command runs normally despite previous failure
    const r2 = await $`echo "recovered"`;
    expect(r2).toSucceed();
    expect(r2).toContainInOutput('recovered');
    console.log(`  r1: code=${r1.code}, r2: code=${r2.code}`);
  });

  test('interactive process cleanup on error', async ({ $ }) => {
    const proc = $({ interactive: true })`sleep 999`;
    await proc.start();

    // Always clean up interactive processes, even after errors
    try {
      await proc.expect('never-appears', { timeout: 500 });
    } catch {
      // Expected timeout — clean up the process
      await proc.interrupt();
      console.log(`  process cleaned up after expect timeout`);
    }
  });
});
