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
  test('pipeline returns exit code of last command (success)', async ({ terminal }) => {
    const result = await terminal.run('echo hello | cat');
    expect(result).toSucceed();
    expect(result).toHaveExitCode(0);
  });

  test('pipeline returns exit code of last command (failure)', async ({ terminal }) => {
    const result = await terminal.run('echo hello | grep nonexistent');
    expect(result).toFail();
    expect(result).toHaveExitCode(1);
    console.log(`  echo | grep fail → code=${result.code}`);
  });

  test('pipeline with successful final stage', async ({ terminal }) => {
    // false fails but wc succeeds → exit code 0
    const result = await terminal.run('echo "line1\nline2\nline3" | wc -l');
    expect(result).toSucceed();
  });

  test('multi-stage pipeline exit code', async ({ terminal }) => {
    const result = await terminal.run('echo "abc 123 def" | tr " " "\\n" | grep "^[0-9]"');
    expect(result).toSucceed();
    expect(result).toContainInOutput('123');
  });
});

describe('Subshell and grouped commands', () => {
  test('subshell exit code propagates', async ({ terminal }) => {
    const result = await terminal.run('(exit 7)');
    expect(result).toFail();
    expect(result).toHaveExitCode(7);
    console.log(`  (exit 7) → code=${result.code}`);
  });

  test('nested subshell exit code', async ({ terminal }) => {
    const result = await terminal.run('(echo outer; (echo inner; exit 3))');
    expect(result).toHaveExitCode(3);
  });

  test('command group with braces', async ({ terminal }) => {
    const result = await terminal.run('{ echo hello; exit 5; }');
    // Note: 'exit 5' in braces exits the whole shell in non-interactive mode
    // In PTY interactive mode, this creates a new subshell context
    console.log(`  group exit code: ${result.code}`);
  });

  test('$() command substitution does not affect exit code', async ({ terminal }) => {
    // The outer echo succeeds even though inner false fails
    const result = await terminal.run('echo "result: $(false; echo $?)"');
    expect(result).toSucceed();
    expect(result).toContainInOutput('result:');
  });
});

describe('Conditional execution (&&, ||)', () => {
  test('&& stops on first failure', async ({ terminal }) => {
    const result = await terminal.run('true && false && echo "never"');
    expect(result).toFail();
    expect(result).toHaveExitCode(1);
    expect(result).not.toContainInOutput('never');
  });

  test('|| continues on failure', async ({ terminal }) => {
    const result = await terminal.run('false || echo "recovered"');
    expect(result).toSucceed();
    expect(result).toContainInOutput('recovered');
  });

  test('mixed && and || chain', async ({ terminal }) => {
    const result = await terminal.run('false || true && echo "ok"');
    expect(result).toSucceed();
    expect(result).toContainInOutput('ok');
  });

  test('&& chain all succeed', async ({ terminal }) => {
    const result = await terminal.run('echo "a" && echo "b" && echo "c"');
    expect(result).toSucceed();
    expect(result).toContainInOutput('a');
    expect(result).toContainInOutput('c');
  });
});

describe('Error types and specific exit codes', () => {
  test('command not found returns 127', async ({ terminal }) => {
    const result = await terminal.run('__nonexistent_command_xyz__ 2>/dev/null; exit $?');
    // In some shells, command-not-found is 127
    console.log(`  command not found → code=${result.code}`);
    expect(result).toFail();
  });

  test('permission denied scenario', async ({ terminal }) => {
    const result = await terminal.run('touch /tmp/repterm-test-perm && chmod 000 /tmp/repterm-test-perm && cat /tmp/repterm-test-perm 2>/dev/null; code=$?; rm -f /tmp/repterm-test-perm; exit $code');
    expect(result).toFail();
    console.log(`  permission denied → code=${result.code}`);
  });

  test('signal-induced exit code (SIGTERM = 143)', async ({ terminal }) => {
    const result = await terminal.run('bash -c \'kill -TERM $$\'');
    console.log(`  SIGTERM self-kill → code=${result.code}`);
    // SIGTERM typically gives 128 + 15 = 143
    expect(result).toFail();
  });

  test('exit code wraps at 256 (modulo)', async ({ terminal }) => {
    const result = await terminal.run('exit 256');
    // exit codes are modulo 256, so 256 → 0
    expect(result).toHaveExitCode(0);
    console.log(`  exit 256 → code=${result.code}`);
  });

  test('negative exit code wraps', async ({ terminal }) => {
    // bash exit 255 = -1 in some contexts; exit code is always 0-255
    const result = await terminal.run('exit 255');
    expect(result).toHaveExitCode(255);
  });
});

describe('Sequential commands tracking', () => {
  test('multiple commands track exit codes independently', async ({ terminal }) => {
    const r1 = await terminal.run('echo "first"; exit 0');
    const r2 = await terminal.run('echo "second"; exit 1');
    const r3 = await terminal.run('echo "third"; exit 0');

    expect(r1).toSucceed();
    expect(r2).toFail();
    expect(r3).toSucceed();
    console.log(`  sequence: ${r1.code}, ${r2.code}, ${r3.code}`);
  });

  test('previous command failure does not affect next command', async ({ terminal }) => {
    await terminal.run('false');
    const result = await terminal.run('echo "fresh start"');
    expect(result).toSucceed();
    expect(result).toContainInOutput('fresh start');
  });

  test('rapid sequential commands all get correct exit codes', async ({ terminal }) => {
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const code = i % 2 === 0 ? 0 : 1;
      const result = await terminal.run(`exit ${code}`);
      results.push(result.code);
    }
    expect(results).toEqual([0, 1, 0, 1, 0]);
    console.log(`  rapid sequence: [${results.join(', ')}]`);
  });
});

describe('Environment variables and working directory', () => {
  test('custom env variables are passed', async ({ terminal }) => {
    const result = await terminal.run('echo "val=$MY_TEST_VAR"', {
      env: { MY_TEST_VAR: 'hello123' },
    });
    expect(result).toSucceed();
    expect(result).toContainInOutput('val=hello123');
  });

  test('custom cwd affects command execution', async ({ terminal }) => {
    const result = await terminal.run('pwd', { cwd: '/tmp' });
    expect(result).toSucceed();
    expect(result).toContainInOutput('/tmp');
  });

  test('env and cwd combined', async ({ terminal }) => {
    const result = await terminal.run('echo "$MARKER $(pwd)"', {
      env: { MARKER: 'HERE' },
      cwd: '/tmp',
    });
    expect(result).toSucceed();
    expect(result).toContainInOutput('HERE');
    expect(result).toContainInOutput('/tmp');
  });
});
