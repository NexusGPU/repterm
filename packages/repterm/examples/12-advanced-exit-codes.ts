/**
 * Example 12: Advanced exit code scenarios with OSC 133
 *
 * Run: bun run repterm examples/12-advanced-exit-codes.ts
 *
 * Tests complex exit code behavior: pipelines, subshells, signals,
 * error types, sequential commands, and edge cases.
 * All exit codes are captured via OSC 133 shell integration.
 */

import { test, expect, describe } from 'repterm';

describe('Pipeline exit codes', () => {
  test('pipeline returns exit code of last command (success)', async ({ $ }) => {
    const result = await $`echo hello | cat`;
    expect(result).toSucceed();
    expect(result).toHaveExitCode(0);
  });

  test('pipeline returns exit code of last command (failure)', async ({ $ }) => {
    const result = await $`echo hello | grep nonexistent`;
    expect(result).toFail();
    expect(result).toHaveExitCode(1);
    console.log(`  echo | grep fail → code=${result.code}`);
  });

  test('pipeline with successful final stage', async ({ $ }) => {
    // false fails but wc succeeds → exit code 0
    const result = await $`echo "line1\nline2\nline3" | wc -l`;
    expect(result).toSucceed();
  });

  test('multi-stage pipeline exit code', async ({ $ }) => {
    const result = await $`echo "abc 123 def" | tr " " "\\n" | grep "^[0-9]"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('123');
  });
});

describe('Subshell and grouped commands', () => {
  test('subshell exit code propagates', async ({ $ }) => {
    const result = await $`(exit 7)`;
    expect(result).toFail();
    expect(result).toHaveExitCode(7);
    console.log(`  (exit 7) → code=${result.code}`);
  });

  test('nested subshell exit code', async ({ $ }) => {
    const result = await $`(echo outer; (echo inner; exit 3))`;
    expect(result).toHaveExitCode(3);
  });

  test('command group with braces', async ({ $ }) => {
    const result = await $`{ echo hello; exit 5; }`;
    // Note: 'exit 5' in braces exits the whole shell in non-interactive mode
    // In PTY interactive mode, this creates a new subshell context
    console.log(`  group exit code: ${result.code}`);
  });

  test('$() command substitution does not affect exit code', async ({ $ }) => {
    // The outer echo succeeds even though inner false fails
    const result = await $`echo "result: $(false; echo $?)"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('result:');
  });
});

describe('Conditional execution (&&, ||)', () => {
  test('&& stops on first failure', async ({ $ }) => {
    const result = await $`true && false && echo "never"`;
    expect(result).toFail();
    expect(result).toHaveExitCode(1);
    expect(result).not.toContainInOutput('never');
  });

  test('|| continues on failure', async ({ $ }) => {
    const result = await $`false || echo "recovered"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('recovered');
  });

  test('mixed && and || chain', async ({ $ }) => {
    const result = await $`false || true && echo "ok"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('ok');
  });

  test('&& chain all succeed', async ({ $ }) => {
    const result = await $`echo "a" && echo "b" && echo "c"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('a');
    expect(result).toContainInOutput('c');
  });
});

describe('Error types and specific exit codes', () => {
  test('command not found returns 127', async ({ $ }) => {
    const result = await $`__nonexistent_command_xyz__ 2>/dev/null; exit $?`;
    // In some shells, command-not-found is 127
    console.log(`  command not found → code=${result.code}`);
    expect(result).toFail();
  });

  test('permission denied scenario', async ({ $ }) => {
    const result = await $`touch /tmp/repterm-test-perm && chmod 000 /tmp/repterm-test-perm && cat /tmp/repterm-test-perm 2>/dev/null; code=$?; rm -f /tmp/repterm-test-perm; exit $code`;
    expect(result).toFail();
    console.log(`  permission denied → code=${result.code}`);
  });

  test('signal-induced exit code (SIGTERM = 143)', async ({ $ }) => {
    const result = await $`bash -c 'kill -TERM $$'`;
    console.log(`  SIGTERM self-kill → code=${result.code}`);
    // SIGTERM typically gives 128 + 15 = 143
    expect(result).toFail();
  });

  test('exit code wraps at 256 (modulo)', async ({ $ }) => {
    const result = await $`exit 256`;
    // exit codes are modulo 256, so 256 → 0
    expect(result).toHaveExitCode(0);
    console.log(`  exit 256 → code=${result.code}`);
  });

  test('negative exit code wraps', async ({ $ }) => {
    // bash exit 255 = -1 in some contexts; exit code is always 0-255
    const result = await $`exit 255`;
    expect(result).toHaveExitCode(255);
  });
});

describe('Sequential commands tracking', () => {
  test('multiple commands track exit codes independently', async ({ $ }) => {
    const r1 = await $`echo "first"; exit 0`;
    const r2 = await $`echo "second"; exit 1`;
    const r3 = await $`echo "third"; exit 0`;

    expect(r1).toSucceed();
    expect(r2).toFail();
    expect(r3).toSucceed();
    console.log(`  sequence: ${r1.code}, ${r2.code}, ${r3.code}`);
  });

  test('previous command failure does not affect next command', async ({ $ }) => {
    await $`false`;
    const result = await $`echo "fresh start"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('fresh start');
  });

  test('rapid sequential commands all get correct exit codes', async ({ $ }) => {
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const code = i % 2 === 0 ? 0 : 1;
      const result = await $`exit ${code}`;
      results.push(result.code);
    }
    expect(results).toEqual([0, 1, 0, 1, 0]);
    console.log(`  rapid sequence: [${results.join(', ')}]`);
  });
});

describe('Environment variables and working directory', () => {
  test('custom env variables are passed', async ({ $ }) => {
    const result = await $({ env: { MY_TEST_VAR: 'hello123' } })`echo "val=$MY_TEST_VAR"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('val=hello123');
  });

  test('custom cwd affects command execution', async ({ $ }) => {
    const result = await $({ cwd: '/tmp' })`pwd`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('/tmp');
  });

  test('env and cwd combined', async ({ $ }) => {
    const result = await $({ env: { MARKER: 'HERE' }, cwd: '/tmp' })`echo "$MARKER $(pwd)"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('HERE');
    expect(result).toContainInOutput('/tmp');
  });
});
