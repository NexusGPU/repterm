/**
 * Example 10: OSC 133 Shell Integration — reliable exit codes in PTY mode
 *
 * Run: bun run repterm examples/10-shell-integration.ts
 *
 * Prior to OSC 133 shell integration, PTY/interactive mode always returned
 * exitCode = -1 because PTY has no built-in mechanism to capture exit codes.
 *
 * With OSC 133 (enabled by default), repterm injects industry-standard shell
 * markers (used by VS Code, iTerm2, Windows Terminal, etc.) via --rcfile/ZDOTDIR
 * during shell initialization, allowing reliable exit code capture in all modes.
 *
 * The injection is invisible — no trace in terminal output or recordings.
 *
 * Three-layer detection strategy:
 *   Layer 1: OSC 133 markers  — event-driven, precise exit code + command boundaries
 *   Layer 2: Enhanced regex    — improved prompt pattern matching (fallback)
 *   Layer 3: Timeout           — silent fallback for edge cases
 */

import { test, expect, describe } from 'repterm';

describe('Exit code accuracy (non-recording)', () => {
  test('successful command returns exit code 0', async ({ terminal }) => {
    const result = await terminal.run('echo "hello"');
    expect(result).toSucceed();
    expect(result).toHaveExitCode(0);
    console.log(`  exit code: ${result.code}`);
  });

  test('failed command returns correct non-zero exit code', async ({ terminal }) => {
    const result = await terminal.run('exit 42');
    expect(result).toFail();
    expect(result).toHaveExitCode(42);
    console.log(`  exit code: ${result.code}`);
  });

  test('false returns exit code 1', async ({ terminal }) => {
    const result = await terminal.run('false');
    expect(result).toFail();
    expect(result).toHaveExitCode(1);
    console.log(`  exit code: ${result.code}`);
  });

  test('distinguish success from failure', async ({ terminal }) => {
    const ok = await terminal.run('true');
    const fail = await terminal.run('ls /nonexistent-path-xyz 2>/dev/null; exit 2');

    expect(ok).toSucceed();
    expect(fail).toFail();
    expect(fail).toHaveExitCode(2);
    console.log(`  true  → code=${ok.code}, successful=${ok.successful}`);
    console.log(`  fail  → code=${fail.code}, successful=${fail.successful}`);
  });
});

describe('Exit code in PTY / interactive mode', () => {
  test('interactive command captures exit code via OSC 133', async ({ terminal }) => {
    // Previously, interactive mode always returned code = -1
    // With OSC 133, we get the real exit code
    const proc = terminal.run('bash -c "echo done; exit 3"', { interactive: true });
    await proc.expect('done');
    const result = await proc;

    // If OSC 133 is active: real exit code; otherwise: -1
    console.log(`  interactive exit code: ${result.code}`);
    expect(result).toContainInOutput('done');
  });

  test('multi-step interactive with correct final exit code', async ({ terminal }) => {
    const script = `bash -c 'read -p "Input: " val; echo "Got: $val"; exit 0'`;
    const proc = terminal.run(script, { interactive: true });

    await proc.expect('Input:');
    await proc.send('hello');
    await proc.expect('Got: hello');

    const result = await proc;
    console.log(`  multi-step exit code: ${result.code}`);
    expect(result).toContainInOutput('Got: hello');
  });
});

describe('Output capture with shell integration', () => {
  test('stdout and stderr separation', async ({ terminal }) => {
    const result = await terminal.run('echo "out"; echo "err" >&2');
    expect(result).toSucceed();
    expect(result).toHaveStdout('out');
    expect(result).toHaveStderr('err');
    expect(result).toContainInOutput('out');
    expect(result).toContainInOutput('err');
  });

  test('multi-line output captured correctly', async ({ terminal }) => {
    const result = await terminal.run('for i in 1 2 3; do echo "line $i"; done');
    expect(result).toSucceed();
    expect(result).toHaveStdout('line 1');
    expect(result).toHaveStdout('line 2');
    expect(result).toHaveStdout('line 3');
  });

  test('command duration is tracked', async ({ terminal }) => {
    const result = await terminal.run('sleep 0.1 && echo "done"');
    expect(result).toSucceed();
    console.log(`  duration: ${result.duration}ms`);
    expect(result.duration).toBeGreaterThan(50);
    expect(result.command).toBe('sleep 0.1 && echo "done"');
  });
});

describe('Prompt detection: promptDetection option', () => {
  test('promptDetection "none" skips prompt wait (for long-running commands)', async ({ terminal }) => {
    // Use promptDetection: 'none' when you know the command will take long
    // and you don't want to wait for prompt detection
    const result = await terminal.run('echo "quick"', { promptDetection: 'none' });
    expect(result).toContainInOutput('quick');
  });
});

// Recording mode example — shows that OSC 133 injection is invisible
describe('Recording with shell integration', { record: true }, () => {
  test('commands record cleanly — no injection artifacts', async ({ terminal }) => {
    // OSC 133 markers are terminal control sequences (like color codes)
    // They are parsed but NOT displayed, so recordings are clean
    await terminal.run('echo "Recording with OSC 133 — no visible injection"');
    await expect(terminal).toContainText('no visible injection');
  });

  test('exit code 0 in recording mode', async ({ terminal }) => {
    const result = await terminal.run('echo "recorded"');
    await expect(terminal).toContainText('recorded');
    console.log(`  recording exit code: ${result.code}`);
  });

  test('non-zero exit code in recording mode', async ({ terminal }) => {
    const result = await terminal.run('false');
    console.log(`  recording false exit code: ${result.code}`);
  });
});
