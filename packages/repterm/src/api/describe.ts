/**
 * test.describe suite grouping
 * Provides nested test organization
 */

import type { TestSuite, DescribeOptions } from '../runner/models.js';
import { registry } from './test.js';
import { randomBytes } from 'crypto';

/**
 * Create a test suite with grouped tests
 *
 * @example
 * // Regular test suite
 * describe('suite name', () => { ... });
 *
 * // Recording test suite
 * describe('suite name', { record: true }, () => { ... });
 */
export function describe(name: string, fn: () => void): void;
export function describe(name: string, options: DescribeOptions, fn: () => void): void;
export function describe(
  name: string,
  optionsOrFn: DescribeOptions | (() => void),
  maybeFn?: () => void
): void {
  const options = typeof optionsOrFn === 'function' ? undefined : optionsOrFn;
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn!;

  // Create a new suite
  const suite: TestSuite = {
    id: generateId(),
    name,
    tests: [],
    suites: [],
    config: {},
    options,
  };

  // Set this as the current suite
  registry.setCurrentSuite(suite);

  // Execute the suite definition function
  // This will register tests to this suite
  fn();

  // Reset to default suite
  registry.resetCurrentSuite();
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return randomBytes(8).toString('hex');
}
