/**
 * Example 14: Recording mode — complex scenarios with OSC 133
 *
 * Run: bun run repterm examples/14-recording-advanced.ts
 *
 * Tests recording mode with complex commands, verifying that exit codes
 * are captured via DCS passthrough in tmux, and recordings are clean.
 */

import { test, expect, describe } from 'repterm';

describe('Recording: pipeline exit codes', { record: true }, () => {
  test('successful pipeline records correct exit code', async ({ $, terminal }) => {
    const result = await $`echo "hello world" | grep hello`;
    await expect(terminal).toContainText('hello world');
    expect(result).toHaveExitCode(0);
    console.log(`  pipeline success → code=${result.code}`);
  });

  test('failed pipeline records correct exit code', async ({ $ }) => {
    const result = await $`echo "hello" | grep xyz`;
    console.log(`  pipeline fail → code=${result.code}`);
    expect(result).toFail();
  });
});

describe('Recording: sequential commands', { record: true }, () => {
  test('multiple commands track codes independently in recording', async ({ $, terminal }) => {
    const r1 = await $`echo "step 1"`;
    await expect(terminal).toContainText('step 1');
    expect(r1).toSucceed();

    const r2 = await $`false`;
    expect(r2).toFail();

    const r3 = await $`echo "recovered"`;
    await expect(terminal).toContainText('recovered');
    expect(r3).toSucceed();

    console.log(`  recording sequence: ${r1.code}, ${r2.code}, ${r3.code}`);
  });
});

describe('Recording: complex output', { record: true }, () => {
  test('multi-line output in recording mode', async ({ $, terminal }) => {
    const result = await $`for i in 1 2 3 4 5; do echo "line $i"; done`;
    await expect(terminal).toContainText('line 5');
    expect(result).toSucceed();
  });

  test('colored output does not interfere with recording', async ({ $, terminal }) => {
    const result = await $`printf "\\033[31mRED\\033[0m \\033[32mGREEN\\033[0m"`;
    expect(result).toSucceed();
    // ANSI codes should be stripped in assertions
    await expect(terminal).toContainText('RED');
    await expect(terminal).toContainText('GREEN');
  });

  test('command with environment variable in recording', async ({ $, terminal }) => {
    const result = await $`echo "HOME=$HOME"`;
    await expect(terminal).toContainText('HOME=/');
    expect(result).toSucceed();
  });
});

describe('Recording: conditional and error scenarios', { record: true }, () => {
  test('conditional && chain in recording', async ({ $, terminal }) => {
    const result = await $`echo "a" && echo "b" && echo "c"`;
    await expect(terminal).toContainText('a');
    await expect(terminal).toContainText('c');
    expect(result).toSucceed();
  });

  test('subshell exit code in recording', async ({ $ }) => {
    const result = await $`(exit 3)`;
    expect(result).toHaveExitCode(3);
    console.log(`  recording subshell → code=${result.code}`);
  });

  test('arithmetic in recording', async ({ $, terminal }) => {
    const result = await $`echo $((7 * 6))`;
    await expect(terminal).toContainText('42');
    expect(result).toSucceed();
  });
});

describe('Recording: timing behavior', { record: true }, () => {
  test('duration tracked in recording mode', async ({ $, terminal }) => {
    const result = await $`sleep 0.1 && echo "timed"`;
    await expect(terminal).toContainText('timed');
    expect(result).toSucceed();
    expect(result.duration).toBeGreaterThan(50);
    console.log(`  recording duration: ${result.duration}ms`);
  });

  test('fast command in recording', async ({ $, terminal }) => {
    const result = await $`echo "instant"`;
    await expect(terminal).toContainText('instant');
    expect(result).toSucceed();
    console.log(`  fast recording: ${result.duration}ms`);
  });
});
