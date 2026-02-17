/**
 * Example 18: Recording Options
 *
 * Run (normal):    bun run repterm examples/18-recording-options.ts
 * Run (recording): bun run repterm --record examples/18-recording-options.ts
 *
 * Demonstrates recording-specific options for controlling the visual
 * appearance of terminal recordings:
 * - typingSpeed: ms/character for typing effect
 * - pauseBefore / pauseAfter: pauses around command execution
 * - showStepTitle: display step name as comment in recording
 * - silent: true: run command without displaying in recording
 *
 * Recording options only take effect in --record mode. In normal mode,
 * these options are accepted but have no visible effect.
 */

import { test, expect, describe, step } from 'repterm';

// ============================================================
// Recording tests — run in PTY mode, add --record for recording
// ============================================================

describe('Recording: typing speed', { record: true }, () => {
  test('default speed (80ms/char)', async ({ $ }) => {
    await $`echo "default typing speed"`;
  });

  test('fast (20ms/char)', async ({ $ }) => {
    await $({ typingSpeed: 20 })`echo "fast typing"`;
  });

  test('instant (0ms)', async ({ $ }) => {
    await $({ typingSpeed: 0 })`echo "instant — no animation"`;
  });
});

describe('Recording: step options', { record: true }, () => {
  test('showStepTitle displays step name as comment', async ({ $ }) => {
    await step('Initialize', { showStepTitle: true, typingSpeed: 0 }, async () => {
      await $`echo "init"`;
    });

    await step('Execute', { showStepTitle: true, typingSpeed: 0 }, async () => {
      await $`echo "work"`;
    });

    await step('Verify', { showStepTitle: true, typingSpeed: 0 }, async () => {
      await $`echo "done"`;
    });
  });

  test('silent mode hides commands from recording', async ({ $ }) => {
    // silent: true — command runs but is not shown in recording
    // Useful for setup/teardown or JSON parsing viewers don't need to see
    await $({ silent: true })`echo "invisible setup"`;
    await $`echo "only visible command"`;
    await $({ silent: true })`echo "invisible cleanup"`;
  });
});

// ============================================================
// Non-recording tests — always run, verify API surface
// ============================================================

describe('RunOptions: recording parameters', () => {
  test('typingSpeed is accepted without recording', async ({ $ }) => {
    const result = await $({ typingSpeed: 200 })`echo "no animation"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('no animation');
    console.log(`  typingSpeed=200 accepted, no effect`);
  });

  test('pauseBefore/pauseAfter are accepted without recording', async ({ $ }) => {
    // In non-recording mode, pauses are ignored — command runs immediately
    const result = await $({ pauseBefore: 1000, pauseAfter: 2000 })`echo "no pause"`;
    expect(result).toSucceed();
    expect(result.duration).toBeLessThan(2000);
    console.log(`  pauses accepted, duration: ${result.duration}ms`);
  });

  test('silent is accepted without recording', async ({ $ }) => {
    const result = await $({ silent: true })`echo "captured normally"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('captured normally');
    console.log(`  silent=true accepted, output available`);
  });

  test('combined options on single command', async ({ $ }) => {
    const result = await $({
      typingSpeed: 40,
      pauseBefore: 500,
      pauseAfter: 1000,
    })`echo "all options"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('all options');
    console.log(`  combined options accepted`);
  });
});

describe('StepRecordingOptions', () => {
  test('step with typingSpeed and showStepTitle', async ({ $ }) => {
    const value = await step('Demo step', { typingSpeed: 0, showStepTitle: true }, async () => {
      const result = await $`echo "inside step"`;
      expect(result).toSucceed();
      return result.code;
    });
    expect(value).toBe(0);
    console.log(`  step returned: ${value}`);
  });

  test('step with pauseAfter and pauseBefore', async ({ $ }) => {
    await step('Paused step', { pauseBefore: 100, pauseAfter: 200 }, async () => {
      const result = await $`echo "paused step"`;
      expect(result).toSucceed();
    });
    console.log(`  step with pauses accepted`);
  });

  test('nested steps with different options', async ({ $ }) => {
    await step('Outer', { typingSpeed: 0 }, async () => {
      await $`echo "outer"`;

      const inner = await step('Inner', { showStepTitle: true }, async () => {
        const result = await $`echo "inner"`;
        return result.stdout.trim();
      });
      expect(inner).toBe('inner');
    });
    console.log(`  nested steps completed`);
  });
});
