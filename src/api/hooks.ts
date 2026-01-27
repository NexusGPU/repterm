/**
 * Hooks and fixtures (beforeEach, afterEach)
 * Provides setup and teardown functionality
 */

import type { TestContext } from '../runner/models.js';

/**
 * Hook function type
 */
export type HookFunction = (context: TestContext) => Promise<void> | void;

/**
 * Global hooks storage
 */
class HooksRegistry {
  private beforeEachHooks: HookFunction[] = [];
  private afterEachHooks: HookFunction[] = [];
  private fixtureFactories: Map<string, (context: TestContext) => unknown> = new Map();

  /**
   * Register a beforeEach hook
   */
  registerBeforeEach(fn: HookFunction): void {
    this.beforeEachHooks.push(fn);
  }

  /**
   * Register an afterEach hook
   */
  registerAfterEach(fn: HookFunction): void {
    this.afterEachHooks.push(fn);
  }

  /**
   * Register a fixture factory
   */
  registerFixture(name: string, factory: (context: TestContext) => unknown): void {
    this.fixtureFactories.set(name, factory);
  }

  /**
   * Run all beforeEach hooks
   */
  async runBeforeEach(context: TestContext): Promise<void> {
    for (const hook of this.beforeEachHooks) {
      await hook(context);
    }
  }

  /**
   * Run all afterEach hooks
   */
  async runAfterEach(context: TestContext): Promise<void> {
    for (const hook of this.afterEachHooks) {
      await hook(context);
    }
  }

  /**
   * Build fixtures for a test
   */
  buildFixtures(context: TestContext): Record<string, unknown> {
    const fixtures: Record<string, unknown> = {};

    for (const [name, factory] of this.fixtureFactories.entries()) {
      fixtures[name] = factory(context);
    }

    return fixtures;
  }

  /**
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.fixtureFactories.clear();
  }
}

// Global hooks registry
export const hooksRegistry = new HooksRegistry();

/**
 * Register a beforeEach hook
 */
export function beforeEach(fn: HookFunction): void {
  hooksRegistry.registerBeforeEach(fn);
}

/**
 * Register an afterEach hook
 */
export function afterEach(fn: HookFunction): void {
  hooksRegistry.registerAfterEach(fn);
}

/**
 * Register a fixture
 */
export function fixture<T>(name: string, factory: (context: TestContext) => T): void {
  hooksRegistry.registerFixture(name, factory);
}

/**
 * Export hooks registry for runner
 */
export { hooksRegistry as hooks };
