/**
 * Example 3: Interactive commands
 *
 * Run: bun run repterm examples/03-interactive-commands.ts
 *
 * Interactive commands require { interactive: true }. In interactive mode
 * exitCode is unreliable (-1); use expect() for output assertions instead.
 */

import { test, expect, describe, raw } from 'repterm';

describe('Interactive commands', () => {
  test('expect — wait for specific output', async ({ $ }) => {
    // { interactive: true } enables expect/send
    const proc = $({ interactive: true })`echo "step 1"; sleep 3; echo "step 2"`;

    await proc.expect('step 1');
    console.log('  Step 1 appeared');

    // Use expect() to verify later output
    await proc.expect('step 2');
    console.log('  Step 2 appeared');
  });

  test('send — send input to a process', async ({ $ }) => {
    // cat reads from stdin and echoes back; use send() to provide input
    const proc = $({ interactive: true })`cat`;

    await proc.send('hello from repterm');
    await proc.expect('hello from repterm');
    console.log('  Input echoed back');

    await proc.interrupt();
  });

  test('multi-step expect/send conversation', async ({ $ }) => {
    const script = `bash -c 'read -p "Name: " name; echo "Hello $name"; read -p "Age: " age; echo "$name is $age years old"'`;
    const proc = $({ interactive: true })`${raw(script)}`;

    await proc.expect('Name:');
    await proc.send('Alice');
    await proc.expect('Hello Alice');
    console.log('  Round 1 completed');

    await proc.expect('Age:');
    await proc.send('30');
    await proc.expect('Alice is 30 years old');
    console.log('  Round 2 completed');
  });
});

describe('Process lifecycle', () => {
  test('interrupt — Ctrl+C to stop a long-running process', async ({ $ }) => {
    const proc = $({ interactive: true })`sleep 999`;

    // start() launches the command without waiting for completion
    await proc.start();
    await new Promise(resolve => setTimeout(resolve, 200));

    await proc.interrupt();
    console.log('  Process interrupted');
  });

  test('PTYProcess can be awaited (non-interactive)', async ({ $ }) => {
    // In record mode, even non-interactive runs use PTY (exitCode is -1)
    const result = await $`echo "done"`;
    expect(result).toContainInOutput('done');
    console.log(`  Exit code: ${result.code}, duration: ${result.duration}ms`);
  });
});
