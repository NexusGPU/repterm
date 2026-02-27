/**
 * Playwright-style test() registration and suite registry
 */

import type { TestCase, TestFunction, TestSuite, TestOptions } from '../runner/models.js';
import { randomBytes } from 'crypto';

/**
 * Global registry of test suites and cases
 */
class TestRegistry {
  private suites: Map<string, TestSuite> = new Map();
  private fileSuites: Map<string, TestSuite> = new Map();
  private suiteStack: TestSuite[] = []; // Stack for nested describe support
  private defaultSuite: TestSuite;

  constructor() {
    // Create a default suite for top-level tests
    this.defaultSuite = {
      id: 'default',
      name: 'default',
      tests: [],
      suites: [],
      config: {},
    };
    this.suites.set('default', this.defaultSuite);
    this.suiteStack.push(this.defaultSuite);
  }

  /**
   * Get the current suite (top of stack)
   */
  private getCurrentSuite(): TestSuite {
    return this.suiteStack[this.suiteStack.length - 1] ?? this.defaultSuite;
  }

  /**
   * Get the current suite ID (for hooks registration)
   */
  getCurrentSuiteId(): string | undefined {
    const suite = this.getCurrentSuite();
    // Return undefined for default suite to indicate global hooks
    return suite.id === 'default' ? undefined : suite.id;
  }

  /**
   * Register a test case
   */
  registerTest(name: string, fn: TestFunction, options?: TestOptions): void {
    const suite = this.getCurrentSuite();

    const testCase: TestCase = {
      id: this.generateId(),
      name,
      steps: [],
      fn,
      options,
      timeout: options?.timeout,
    };

    suite.tests.push(testCase);
  }

  /**
   * Get all registered test suites
   */
  getSuites(): TestSuite[] {
    // Filter out empty default suite if there are file suites
    const suites = Array.from(this.suites.values());
    if (this.fileSuites.size > 0 && this.defaultSuite.tests.length === 0) {
      return suites.filter(s => s.id !== 'default');
    }
    return suites;
  }

  /**
   * Get only root-level suites for execution
   * This returns file-level suites if present, otherwise suites without parents
   */
  getRootSuites(): TestSuite[] {
    // If we have file suites, return only file-level suites
    if (this.fileSuites.size > 0) {
      return Array.from(this.fileSuites.values());
    }

    // No file suites - return default suite if it has content
    if (this.defaultSuite.tests.length > 0 || (this.defaultSuite.suites && this.defaultSuite.suites.length > 0)) {
      return [this.defaultSuite];
    }

    // Fallback: return suites without parents
    return Array.from(this.suites.values()).filter(s => !s.parent);
  }

  /**
   * Get a specific suite by ID
   */
  getSuite(id: string): TestSuite | undefined {
    return this.suites.get(id);
  }

  /**
   * Push a new suite onto the stack (for describe() blocks)
   */
  pushSuite(suite: TestSuite): void {
    const parentSuite = this.getCurrentSuite();

    // Add to parent's nested suites
    if (!parentSuite.suites) {
      parentSuite.suites = [];
    }
    parentSuite.suites.push(suite);

    // Link parent
    suite.parent = parentSuite;

    // Register in the global suites map
    this.suites.set(suite.id, suite);

    // Push onto stack
    this.suiteStack.push(suite);
  }

  /**
   * Pop the current suite from the stack (end of describe() block)
   */
  popSuite(): void {
    if (this.suiteStack.length > 1) {
      this.suiteStack.pop();
    }
  }

  /**
   * Set the current suite (for describe() blocks) - legacy compatibility
   */
  setCurrentSuite(suite: TestSuite): void {
    this.pushSuite(suite);
  }

  /**
   * Set the current file and create/reuse a file-level suite.
   * Returns the file suite so the loader can assign orphan tests (e.g. from cached modules).
   */
  setCurrentFile(filePath: string): TestSuite {
    // Extract filename from path (handle both / and \)
    const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;

    // Check if suite for this file already exists
    let fileSuite = this.fileSuites.get(fileName);
    if (!fileSuite) {
      fileSuite = {
        id: `file-${this.generateId()}`,
        name: fileName,
        tests: [],
        suites: [],
        config: {},
      };
      this.fileSuites.set(fileName, fileSuite);
      this.suites.set(fileSuite.id, fileSuite);
    }

    // Reset stack and push file suite
    this.suiteStack = [fileSuite];
    return fileSuite;
  }

  /**
   * Take any tests that were registered on the default suite (e.g. by a cached module
   * that ran when default was current). Used by the loader to assign them to the file suite.
   */
  takeTestsFromDefaultSuite(): TestCase[] {
    const tests = this.defaultSuite.tests;
    this.defaultSuite.tests = [];
    return tests;
  }

  /**
   * Reset to default suite
   */
  resetCurrentSuite(): void {
    this.popSuite();
  }

  /**
   * Clear all registered tests (for testing)
   */
  clear(): void {
    this.suites.clear();
    this.fileSuites.clear();
    this.defaultSuite = {
      id: 'default',
      name: 'default',
      tests: [],
      suites: [],
      config: {},
    };
    this.suites.set('default', this.defaultSuite);
    this.suiteStack = [this.defaultSuite];
  }

  /**
   * Generate a unique test ID
   */
  private generateId(): string {
    return randomBytes(8).toString('hex');
  }
}

/** Global key used by loader so dynamically imported test files use the same registry (and __pendingFileSuite). */
export const GLOBAL_REGISTRY_KEY = '__repterm_registry';

const defaultRegistry = new TestRegistry();

function getRegistry(): TestRegistry {
  if (typeof globalThis === 'undefined') return defaultRegistry;
  const g = (globalThis as Record<string, unknown>)[GLOBAL_REGISTRY_KEY];
  return (g as TestRegistry) ?? defaultRegistry;
}

export const registry: TestRegistry = defaultRegistry;

/**
 * Playwright-style test() function
 * Registers a test case with the current suite
 *
 * @example
 * // Regular test
 * test('name', async ({ terminal }) => { ... });
 *
 * // Recording test
 * test('name', { record: true }, async ({ terminal }) => { ... });
 */
export function test(name: string, fn: TestFunction): void;
export function test(name: string, options: TestOptions, fn: TestFunction): void;
export function test(
  name: string,
  optionsOrFn: TestOptions | TestFunction,
  maybeFn?: TestFunction
): void {
  const options = typeof optionsOrFn === 'function' ? undefined : optionsOrFn;
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn!;
  
  getRegistry().registerTest(name, fn, options);
}

/**
 * Get all registered tests
 */
export function getTests(): TestSuite[] {
  return getRegistry().getSuites();
}

/**
 * Clear all registered tests
 */
export function clearTests(): void {
  getRegistry().clear();
}
