/**
 * Playwright-style expect() terminal matchers
 * Provides assertions for terminal output
 */

import type { TerminalAPI } from '../runner/models.js';

export class TerminalExpect {
  constructor(private terminal: TerminalAPI) {}

  /**
   * Assert that terminal contains text
   */
  async toContainText(expected: string): Promise<void> {
    const snapshot = await this.terminal.snapshot();

    if (!snapshot.includes(expected)) {
      throw new AssertionError(
        `Expected terminal to contain text "${expected}"`,
        expected,
        snapshot
      );
    }
  }

  /**
   * Assert that terminal does not contain text
   */
  async not_toContainText(expected: string): Promise<void> {
    const snapshot = await this.terminal.snapshot();

    if (snapshot.includes(expected)) {
      throw new AssertionError(
        `Expected terminal NOT to contain text "${expected}"`,
        `not "${expected}"`,
        snapshot
      );
    }
  }

  /**
   * Assert that terminal output matches regex
   */
  async toMatchPattern(pattern: RegExp): Promise<void> {
    const snapshot = await this.terminal.snapshot();

    if (!pattern.test(snapshot)) {
      throw new AssertionError(
        `Expected terminal to match pattern ${pattern}`,
        pattern.toString(),
        snapshot
      );
    }
  }
}

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

/**
 * Create expect() matcher for terminal
 */
export function expect(terminal: TerminalAPI): TerminalExpect {
  return new TerminalExpect(terminal);
}
