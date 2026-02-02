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
   * Set the current file and create/reuse a file-level suite
   */
  setCurrentFile(filePath: string): void {
    // Extract filename from path
    const fileName = filePath.split('/').pop() || filePath;

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

// Global registry instance
export const registry = new TestRegistry();

/**
 * Playwright-style test() function
 * Registers a test case with the current suite
 * 
 * @example
 * // 普通测试
 * test('name', async ({ terminal }) => { ... });
 * 
 * // 录制测试
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
  
  registry.registerTest(name, fn, options);
}

/**
 * Get all registered tests
 */
export function getTests(): TestSuite[] {
  return registry.getSuites();
}

/**
 * Clear all registered tests
 */
export function clearTests(): void {
  registry.clear();
}
