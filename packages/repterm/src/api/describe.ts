/**
 * test.describe suite grouping
 * Provides nested test organization
 */

import type { TestSuite } from '../runner/models.js';
import { registry } from './test.js';
import { randomBytes } from 'crypto';

/**
 * Create a test suite with grouped tests
 */
export function describe(name: string, fn: () => void): void {
  // Create a new suite
  const suite: TestSuite = {
    id: generateId(),
    name,
    tests: [],
    suites: [],
    config: {},
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
