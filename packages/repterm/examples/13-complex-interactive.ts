/**
 * Example 13: Complex interactive scenarios with OSC 133
 *
 * Run: bun run repterm examples/13-complex-interactive.ts
 *
 * Tests complex interactive workflows: multi-round conversations,
 * signal handling, raw input, long-running processes, and recording
 * mode with complex commands.
 */

import { test, expect, describe, raw } from 'repterm';

describe('Complex interactive flows', () => {
  test('multi-round input with conditional logic', async ({ $ }) => {
    const script = `bash -c '
      read -p "Enter number: " n
      if [ "$n" -gt 10 ]; then
        echo "Big number: $n"
        exit 0
      else
        echo "Small number: $n"
        exit 1
      fi
    '`;
    const proc = $({ interactive: true })`${raw(script)}`;

    await proc.expect('Enter number:');
    await proc.send('42');
    await proc.expect('Big number: 42');

    const result = await proc;
    expect(result).toSucceed();
    console.log(`  conditional → code=${result.code}`);
  });

  test('loop-based interactive prompt', async ({ $ }) => {
    const script = `bash -c '
      for i in 1 2 3; do
        read -p "Round $i: " val
        echo "Got: $val"
      done
      echo "All done"
    '`;
    const proc = $({ interactive: true })`${raw(script)}`;

    for (let i = 1; i <= 3; i++) {
      await proc.expect(`Round ${i}:`);
      await proc.send(`answer${i}`);
      await proc.expect(`Got: answer${i}`);
    }
    await proc.expect('All done');

    const result = await proc;
    expect(result).toSucceed();
    console.log(`  3-round loop completed`);
  });

  test('password-style hidden input with sendRaw', async ({ $ }) => {
    // Use bash read -s for silent input
    const script = `bash -c 'read -sp "Password: " pw; echo; echo "Length: \${#pw}"'`;
    const proc = $({ interactive: true })`${raw(script)}`;

    await proc.expect('Password:');
    // sendRaw doesn't append newline, so manually add \r
    await proc.sendRaw('secret123\r');
    await proc.expect('Length: 9');

    const result = await proc;
    expect(result).toSucceed();
  });

  test('tab-separated field processing', async ({ $ }) => {
    const script = `bash -c 'read -p "CSV: " line; echo "$line" | tr "," "\\n" | while read field; do echo "Field: $field"; done'`;
    const proc = $({ interactive: true })`${raw(script)}`;

    await proc.expect('CSV:');
    await proc.send('a,b,c');
    await proc.expect('Field: a');
    await proc.expect('Field: c');

    const result = await proc;
    expect(result).toSucceed();
  });
});

describe('Signal handling and interrupts', () => {
  test('interrupt a running process and verify', async ({ $ }) => {
    const proc = $({ interactive: true })`bash -c 'trap "echo CAUGHT; exit 42" INT; sleep 999'`;

    await proc.start();
    // Wait for sleep to actually start
    await new Promise(resolve => setTimeout(resolve, 500));

    await proc.interrupt();
    await proc.expect('CAUGHT');

    const result = await proc;
    expect(result).toHaveExitCode(42);
    console.log(`  trap INT → code=${result.code}`);
  });

  test('interrupt without trap uses default behavior', async ({ $ }) => {
    const proc = $({ interactive: true })`sleep 999`;
    await proc.start();
    await new Promise(resolve => setTimeout(resolve, 300));

    await proc.interrupt();
    const result = await proc;
    // After SIGINT, the shell prompt returns
    console.log(`  interrupt sleep → code=${result.code}`);
  });
});

describe('Complex shell constructs', () => {
  test('here-string (<<<) captures output correctly', async ({ $ }) => {
    const result = await $`cat <<< "hello from here-string"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('hello from here-string');
  });

  test('process substitution', async ({ $ }) => {
    const result = await $`bash -c 'diff <(echo "a") <(echo "a"); echo "exit: $?"'`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('exit: 0');
  });

  test('arithmetic evaluation', async ({ $ }) => {
    const result = await $`echo $((2 ** 10))`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('1024');
  });

  test('variable expansion and string manipulation', async ({ $ }) => {
    const result = await $`bash -c 'str="hello world"; echo "\${str^^}" "\${#str}"'`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('HELLO WORLD');
    expect(result).toContainInOutput('11');
  });

  test('array operations in bash', async ({ $ }) => {
    const result = await $`arr=(one two three); echo "\${arr[@]}" count="\${#arr[@]}"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('one two three');
    expect(result).toContainInOutput('count=3');
  });
});

describe('Output volume and formatting', () => {
  test('large output is captured correctly', async ({ $ }) => {
    const result = await $`seq 1 200`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('1');
    expect(result).toContainInOutput('100');
    expect(result).toContainInOutput('200');
  });

  test('multi-line output with special characters', async ({ $ }) => {
    const result = await $`printf "line1\\tTAB\\nline2\\tTAB\\n"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('line1');
    expect(result).toContainInOutput('line2');
  });

  test('empty output with success exit code', async ({ $ }) => {
    const result = await $`true`;
    expect(result).toSucceed();
    expect(result).toHaveExitCode(0);
  });

  test('stderr only output', async ({ $ }) => {
    const result = await $`echo "error msg" >&2`;
    expect(result).toSucceed();
    expect(result).toHaveStderr('error msg');
  });

  test('interleaved stdout and stderr', async ({ $ }) => {
    const result = await $`echo "out1"; echo "err1" >&2; echo "out2"; echo "err2" >&2`;
    expect(result).toSucceed();
    expect(result).toHaveStdout('out1');
    expect(result).toHaveStdout('out2');
    expect(result).toHaveStderr('err1');
    expect(result).toHaveStderr('err2');
  });
});

describe('Timing and duration', () => {
  test('fast command has low duration', async ({ $ }) => {
    const result = await $`echo fast`;
    expect(result).toSucceed();
    expect(result.duration).toBeLessThan(2000);
    console.log(`  fast command: ${result.duration}ms`);
  });

  test('sleep command has measurable duration', async ({ $ }) => {
    const result = await $`sleep 0.2 && echo "done"`;
    expect(result).toSucceed();
    expect(result.duration).toBeGreaterThan(100);
    console.log(`  sleep 0.2: ${result.duration}ms`);
  });

  test('command field is preserved', async ({ $ }) => {
    const cmd = 'echo "test command tracking"';
    const result = await $`${raw(cmd)}`;
    expect(result.command).toBe(cmd);
  });
});

describe('Terminal snapshot and waitForText', () => {
  test('snapshot captures current terminal state', async ({ $, terminal }) => {
    await $`echo "snapshot-marker-12345"`;
    const snap = await terminal.snapshot();
    expect(snap).toContain('snapshot-marker-12345');
  });

  test('waitForText detects delayed output', async ({ $, terminal }) => {
    const proc = $({ interactive: true })`sleep 0.3 && echo "delayed-output"`;
    await proc.start();
    await terminal.waitForText('delayed-output', { timeout: 5000 });
    console.log('  delayed output detected');
  });
});
