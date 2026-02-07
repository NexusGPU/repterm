/**
 * Expect API based on bun:test
 *
 * Extends bun:test's expect with domain-specific matchers for
 * terminal output and command results. Plugins can register
 * additional matchers via expect.extend().
 */

import { expect } from 'bun:test';
import type { TerminalAPI, CommandResult } from '../runner/models.js';

// Re-export for consumers (single source of truth in plugin-api)
export type { MatcherResult } from 'repterm-api';

/**
 * Assertion error with expected/actual values
 */
export class AssertionError extends Error {
  public expected: unknown;
  public actual: unknown;

  constructor(
    message: string,
    expected: unknown,
    actual: unknown
  ) {
    super(message);
    this.name = 'AssertionError';
    this.expected = expected;
    this.actual = actual;
  }
}

// ===== Type Guards =====

function isTerminalAPI(value: unknown): value is TerminalAPI {
  return (
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    'snapshot' in value &&
    typeof (value as TerminalAPI).run === 'function'
  );
}

function isCommandResult(value: unknown): value is CommandResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'stdout' in value &&
    'stderr' in value &&
    'output' in value
  );
}

// ===== Register repterm matchers =====

expect.extend({
  // Terminal matchers
  async toContainText(received: unknown, expected: string) {
    if (!isTerminalAPI(received)) {
      return { pass: false, message: () => 'Expected a TerminalAPI instance' };
    }
    const snapshot = await received.snapshot();
    const pass = snapshot.includes(expected);
    return {
      pass,
      message: () => pass
        ? `Expected terminal NOT to contain "${expected}"`
        : `Expected terminal to contain "${expected}"`,
    };
  },

  async toMatchPattern(received: unknown, pattern: RegExp) {
    if (!isTerminalAPI(received)) {
      return { pass: false, message: () => 'Expected a TerminalAPI instance' };
    }
    const snapshot = await received.snapshot();
    const pass = pattern.test(snapshot);
    return {
      pass,
      message: () => pass
        ? `Expected terminal NOT to match ${pattern}`
        : `Expected terminal to match ${pattern}`,
    };
  },

  // CommandResult matchers
  toSucceed(received: unknown) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = received.code === 0;
    return {
      pass,
      message: () => pass
        ? 'Expected command NOT to succeed'
        : `Expected command to succeed, got exit code ${received.code}`,
    };
  },

  toFail(received: unknown) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = received.code !== 0;
    return {
      pass,
      message: () => pass
        ? 'Expected command NOT to fail'
        : 'Expected command to fail, but it succeeded',
    };
  },

  toHaveExitCode(received: unknown, expected: number) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = received.code === expected;
    return {
      pass,
      message: () => pass
        ? `Expected exit code NOT to be ${expected}`
        : `Expected exit code ${expected}, got ${received.code}`,
    };
  },

  toHaveStdout(received: unknown, expected: string) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = received.stdout.includes(expected);
    return {
      pass,
      message: () => pass
        ? `Expected stdout NOT to contain "${expected}"`
        : `Expected stdout to contain "${expected}"`,
    };
  },

  toHaveStderr(received: unknown, expected: string) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = received.stderr.includes(expected);
    return {
      pass,
      message: () => pass
        ? `Expected stderr NOT to contain "${expected}"`
        : `Expected stderr to contain "${expected}"`,
    };
  },

  toMatchStdout(received: unknown, pattern: RegExp) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = pattern.test(received.stdout);
    return {
      pass,
      message: () => pass
        ? `Expected stdout NOT to match ${pattern}`
        : `Expected stdout to match ${pattern}`,
    };
  },

  toMatchStderr(received: unknown, pattern: RegExp) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = pattern.test(received.stderr);
    return {
      pass,
      message: () => pass
        ? `Expected stderr NOT to match ${pattern}`
        : `Expected stderr to match ${pattern}`,
    };
  },

  toContainInOutput(received: unknown, expected: string) {
    if (!isCommandResult(received)) {
      return { pass: false, message: () => 'Expected a CommandResult' };
    }
    const pass = received.output.includes(expected);
    return {
      pass,
      message: () => pass
        ? `Expected output NOT to contain "${expected}"`
        : `Expected output to contain "${expected}"`,
    };
  },
});

// ===== Type declarations for custom matchers =====

declare module 'bun:test' {
  interface Matchers<T> {
    /** Assert that terminal contains text */
    toContainText(expected: string): Promise<void>;
    /** Assert that terminal output matches regex */
    toMatchPattern(pattern: RegExp): Promise<void>;
    /** Assert command succeeded (exit code === 0) */
    toSucceed(): Matchers<T>;
    /** Assert command failed (exit code !== 0) */
    toFail(): Matchers<T>;
    /** Assert exit code equals expected value */
    toHaveExitCode(expected: number): Matchers<T>;
    /** Assert stdout contains expected text */
    toHaveStdout(expected: string): Matchers<T>;
    /** Assert stderr contains expected text */
    toHaveStderr(expected: string): Matchers<T>;
    /** Assert stdout matches regex pattern */
    toMatchStdout(pattern: RegExp): Matchers<T>;
    /** Assert stderr matches regex pattern */
    toMatchStderr(pattern: RegExp): Matchers<T>;
    /** Assert combined output contains text */
    toContainInOutput(expected: string): Matchers<T>;
  }
}

// ===== Re-export =====

export { expect };
