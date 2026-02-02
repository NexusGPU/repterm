/**
 * Playwright-style expect() matchers
 * Provides assertions for terminal output and command results
 * Supports custom matchers via expect.extend()
 */

import type { TerminalAPI, CommandResult } from '../runner/models.js';

// ===== Matcher Types =====

/**
 * Result returned by a custom matcher
 */
export interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

/**
 * Context available to custom matchers
 */
export interface MatcherContext {
  isNot: boolean;
  equals: (a: unknown, b: unknown) => boolean;
}

/**
 * Custom matcher function type
 */
export type MatcherFunction<T = unknown, Args extends unknown[] = unknown[]> =
  (this: MatcherContext, received: T, ...args: Args) => MatcherResult | Promise<MatcherResult>;

/**
 * Storage for custom matchers registered via expect.extend()
 */
const customMatchers: Record<string, MatcherFunction> = {};

/**
 * Simple deep equality check
 */
function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
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

// ===== Terminal Expect =====

/**
 * 否定断言类 - Terminal
 */
class NegatedTerminalExpect {
  constructor(private terminal: TerminalAPI) { }

  /**
   * Assert that terminal does NOT contain text
   */
  async toContainText(expected: string): Promise<void> {
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
   * Assert that terminal does NOT match regex
   */
  async toMatchPattern(pattern: RegExp): Promise<void> {
    const snapshot = await this.terminal.snapshot();

    if (pattern.test(snapshot)) {
      throw new AssertionError(
        `Expected terminal NOT to match pattern ${pattern}`,
        `not ${pattern.toString()}`,
        snapshot
      );
    }
  }
}

/**
 * Terminal 断言类
 */
export class TerminalExpect {
  constructor(private terminal: TerminalAPI) { }

  /**
   * 否定断言入口
   */
  get not(): NegatedTerminalExpect {
    return new NegatedTerminalExpect(this.terminal);
  }

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

// ===== CommandResult Expect =====

/**
 * 否定断言类 - CommandResult
 */
class NegatedCommandResultExpect {
  constructor(private result: CommandResult) { }

  /**
   * Assert command did NOT succeed (exit code !== 0)
   */
  toSucceed(): void {
    if (this.result.code === 0) {
      throw new AssertionError(
        'Expected command NOT to succeed, but it did',
        'non-zero exit code',
        0
      );
    }
  }

  /**
   * Assert command did NOT fail (exit code === 0)
   */
  toFail(): void {
    if (this.result.code !== 0) {
      throw new AssertionError(
        'Expected command NOT to fail, but it did',
        0,
        this.result.code
      );
    }
  }

  /**
   * Assert exit code is NOT the expected value
   */
  toHaveExitCode(expected: number): void {
    if (this.result.code === expected) {
      throw new AssertionError(
        `Expected exit code NOT to be ${expected}`,
        `not ${expected}`,
        this.result.code
      );
    }
  }

  /**
   * Assert stdout does NOT contain text
   */
  toHaveStdout(text: string): void {
    if (this.result.stdout.includes(text)) {
      throw new AssertionError(
        `Expected stdout NOT to contain "${text}"`,
        `not "${text}"`,
        this.result.stdout
      );
    }
  }

  /**
   * Assert stderr does NOT contain text
   */
  toHaveStderr(text: string): void {
    if (this.result.stderr.includes(text)) {
      throw new AssertionError(
        `Expected stderr NOT to contain "${text}"`,
        `not "${text}"`,
        this.result.stderr
      );
    }
  }

  /**
   * Assert stdout does NOT match pattern
   */
  toMatchStdout(pattern: RegExp): void {
    if (pattern.test(this.result.stdout)) {
      throw new AssertionError(
        `Expected stdout NOT to match ${pattern}`,
        `not ${pattern.toString()}`,
        this.result.stdout
      );
    }
  }

  /**
   * Assert stderr does NOT match pattern
   */
  toMatchStderr(pattern: RegExp): void {
    if (pattern.test(this.result.stderr)) {
      throw new AssertionError(
        `Expected stderr NOT to match ${pattern}`,
        `not ${pattern.toString()}`,
        this.result.stderr
      );
    }
  }

  /**
   * Assert output does NOT contain text
   */
  toContainInOutput(text: string): void {
    if (this.result.output.includes(text)) {
      throw new AssertionError(
        `Expected output NOT to contain "${text}"`,
        `not "${text}"`,
        this.result.output
      );
    }
  }
}

/**
 * CommandResult 断言类，支持链式调用
 */
export class CommandResultExpect {
  constructor(private result: CommandResult) { }

  /**
   * 否定断言入口
   */
  get not(): NegatedCommandResultExpect {
    return new NegatedCommandResultExpect(this.result);
  }

  /**
   * Assert exit code equals expected value
   */
  toHaveExitCode(expected: number): this {
    if (this.result.code !== expected) {
      throw new AssertionError(
        `Expected exit code ${expected}, got ${this.result.code}`,
        expected,
        this.result.code
      );
    }
    return this;
  }

  /**
   * Assert command succeeded (exit code === 0)
   */
  toSucceed(): this {
    return this.toHaveExitCode(0);
  }

  /**
   * Assert command failed (exit code !== 0)
   */
  toFail(): this {
    if (this.result.code === 0) {
      throw new AssertionError(
        'Expected command to fail, but it succeeded',
        'non-zero exit code',
        0
      );
    }
    return this;
  }

  /**
   * Assert stdout contains expected text
   */
  toHaveStdout(expected: string): this {
    if (!this.result.stdout.includes(expected)) {
      throw new AssertionError(
        `Expected stdout to contain "${expected}"`,
        expected,
        this.result.stdout
      );
    }
    return this;
  }

  /**
   * Assert stderr contains expected text
   */
  toHaveStderr(expected: string): this {
    if (!this.result.stderr.includes(expected)) {
      throw new AssertionError(
        `Expected stderr to contain "${expected}"`,
        expected,
        this.result.stderr
      );
    }
    return this;
  }

  /**
   * Assert stdout matches regex pattern
   */
  toMatchStdout(pattern: RegExp): this {
    if (!pattern.test(this.result.stdout)) {
      throw new AssertionError(
        `Expected stdout to match ${pattern}`,
        pattern.toString(),
        this.result.stdout
      );
    }
    return this;
  }

  /**
   * Assert stderr matches regex pattern
   */
  toMatchStderr(pattern: RegExp): this {
    if (!pattern.test(this.result.stderr)) {
      throw new AssertionError(
        `Expected stderr to match ${pattern}`,
        pattern.toString(),
        this.result.stderr
      );
    }
    return this;
  }

  /**
   * Assert combined output (stdout + stderr) contains text
   */
  toContainInOutput(expected: string): this {
    if (!this.result.output.includes(expected)) {
      throw new AssertionError(
        `Expected output to contain "${expected}"`,
        expected,
        this.result.output
      );
    }
    return this;
  }
}

// ===== Generic Expect for Custom Matchers =====

/**
 * Generic expect class that supports custom matchers
 */
export class GenericExpect<T> {
  private _isNot = false;

  constructor(private value: T) {
    // Bind all custom matchers to this instance
    for (const [name, fn] of Object.entries(customMatchers)) {
      (this as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
        const context: MatcherContext = {
          isNot: this._isNot,
          equals: deepEquals,
        };
        const result = await fn.call(context, this.value, ...args);

        const pass = this._isNot ? !result.pass : result.pass;
        if (!pass) {
          throw new AssertionError(
            result.message(),
            result.expected,
            result.actual
          );
        }
        return this; // Support chaining
      };
    }
  }

  /**
   * Negation modifier
   */
  get not(): this {
    this._isNot = true;
    return this;
  }
}

// ===== expect() 函数 =====

/**
 * 判断是否为 CommandResult
 */
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

/**
 * 判断是否为 TerminalAPI
 */
function isTerminalAPI(value: unknown): value is TerminalAPI {
  return (
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    'snapshot' in value &&
    typeof (value as TerminalAPI).run === 'function'
  );
}

/**
 * Expect function interface with extend method
 */
export interface ExpectWithExtend {
  (value: TerminalAPI): TerminalExpect;
  (value: CommandResult): CommandResultExpect;
  <T>(value: T): GenericExpect<T>;
  /**
   * Register custom matchers
   * @example
   * expect.extend({
   *   toBeRunning(received, timeout) {
   *     // matcher implementation
   *     return { pass: true, message: () => 'Expected not to be running' };
   *   }
   * });
   */
  extend(matchers: Record<string, MatcherFunction>): void;
}

/**
 * Create expect() matcher for terminal, command result, or custom value
 * 
 * @example
 * // Terminal 断言
 * expect(terminal).toContainText('hello');
 * expect(terminal).not.toContainText('error');
 * 
 * @example
 * // CommandResult 断言（支持链式调用）
 * expect(result).toSucceed().toHaveStdout('hello');
 * expect(result).not.toContainInOutput('error');
 * 
 * @example
 * // Custom matchers
 * expect.extend({
 *   async toBeRunning(received, timeout) {
 *     return { pass: true, message: () => 'message' };
 *   }
 * });
 * await expect(resource).toBeRunning();
 */
function expectImpl(value: TerminalAPI): TerminalExpect;
function expectImpl(value: CommandResult): CommandResultExpect;
function expectImpl<T>(value: T): GenericExpect<T>;
function expectImpl<T>(value: T): TerminalExpect | CommandResultExpect | GenericExpect<T> {
  if (isTerminalAPI(value)) {
    return new TerminalExpect(value as unknown as TerminalAPI);
  }
  if (isCommandResult(value)) {
    return new CommandResultExpect(value as unknown as CommandResult);
  }
  // Default: use GenericExpect for custom matchers
  return new GenericExpect(value);
}

/**
 * Main expect function with extend capability
 */
export const expect: ExpectWithExtend = Object.assign(expectImpl, {
  /**
   * Register custom matchers
   */
  extend(matchers: Record<string, MatcherFunction>): void {
    Object.assign(customMatchers, matchers);
  },
});
