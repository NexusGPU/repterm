/**
 * Repterm - CLI/TUI Test Framework
 * 
 * Public API entrypoint following Playwright-style conventions
 */

// Core test registration and execution
export { test, getTests, clearTests } from './api/test.js';
export { expect } from './api/expect.js';

// Test organization features
export { describe } from './api/describe.js';
export { step } from './api/steps.js';
export { beforeEach, afterEach, fixture } from './api/hooks.js';

// Re-export types for user convenience
export type { TestContext, TerminalAPI, WaitOptions } from './runner/models.js';
export type { TestFunction } from './runner/models.js';

// Attach step to test namespace for test.step() syntax
import { test as testFn } from './api/test.js';
import { step as stepFn } from './api/steps.js';
import { describe as describeFn } from './api/describe.js';

// Extend test with additional methods
Object.assign(testFn, {
  step: stepFn,
  describe: describeFn,
});
