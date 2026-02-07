/**
 * Hooks (beforeEach, afterEach) with Named Fixture Support
 * Provides setup and teardown functionality with lazy execution
 * 
 * Fixtures are only executed when tests explicitly request them via parameters.
 */

import type { TestContext, TestSuite } from '../runner/models.js';
import { registry } from './test.js';

/**
 * Base hook function type
 */
export type HookFunction = (context: TestContext) => Promise<void> | void;

/**
 * Enhanced hook: return value is merged into context
 */
export type EnhancedHookFunction = (
  context: TestContext
) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;

/**
 * Named beforeEach hook entry (for lazy execution)
 */
interface NamedBeforeEachEntry {
  name: string; // Fixture name
  fn: EnhancedHookFunction;
  suiteId?: string;
}

/**
 * Named afterEach hook entry (for lazy cleanup)
 */
interface NamedAfterEachEntry {
  name: string; // Fixture name
  fn: HookFunction;
  suiteId?: string;
}

/**
 * Named beforeAll hook entry
 */
interface NamedBeforeAllEntry {
  name?: string;
  fn: EnhancedHookFunction;
  suiteId: string;
}

/**
 * Named afterAll hook entry
 */
interface NamedAfterAllEntry {
  name?: string;
  fn: HookFunction;
  suiteId: string;
}

/**
 * Global hooks storage with named fixture support
 */
class HooksRegistry {
  private namedBeforeEachHooks: NamedBeforeEachEntry[] = [];
  private namedAfterEachHooks: NamedAfterEachEntry[] = [];
  private suiteBeforeAllHooks: Map<string, NamedBeforeAllEntry[]> = new Map();
  private suiteAfterAllHooks: Map<string, NamedAfterAllEntry[]> = new Map();

  /**
   * Register a named beforeEach hook (lazy execution)
   * @param name Fixture name - only executed if test requests this fixture
   * @param fn Hook function
   * @param suiteId Optional suite ID to scope the hook
   */
  registerBeforeEach(name: string, fn: EnhancedHookFunction, suiteId?: string): void {
    this.namedBeforeEachHooks.push({ name, fn, suiteId });
  }

  /**
   * Register a named afterEach hook (lazy cleanup)
   * @param name Fixture name - only executed if the corresponding beforeEach was run
   * @param fn Hook function
   * @param suiteId Optional suite ID to scope the hook
   */
  registerAfterEach(name: string, fn: HookFunction, suiteId?: string): void {
    this.namedAfterEachHooks.push({ name, fn, suiteId });
  }

  /**
   * Register a beforeAll hook for a suite
   * @param name Optional fixture name
   * @param fn Hook function
   * @param suiteId Suite ID to scope the hook
   */
  registerBeforeAll(name: string | undefined, fn: EnhancedHookFunction, suiteId: string): void {
    if (!this.suiteBeforeAllHooks.has(suiteId)) {
      this.suiteBeforeAllHooks.set(suiteId, []);
    }
    this.suiteBeforeAllHooks.get(suiteId)!.push({ name, fn, suiteId });
  }

  /**
   * Register an afterAll hook for a suite
   * @param name Optional fixture name
   * @param fn Hook function
   * @param suiteId Suite ID to scope the hook
   */
  registerAfterAll(name: string | undefined, fn: HookFunction, suiteId: string): void {
    if (!this.suiteAfterAllHooks.has(suiteId)) {
      this.suiteAfterAllHooks.set(suiteId, []);
    }
    this.suiteAfterAllHooks.get(suiteId)!.push({ name, fn, suiteId });
  }

  /**
   * Get the chain of suite IDs from root to the given suite
   */
  private getSuiteChain(suite?: TestSuite): string[] {
    const chain: string[] = [];
    let current = suite;
    while (current) {
      chain.unshift(current.id);
      current = current.parent;
    }
    return chain;
  }

  /**
   * Check if a hook should run for a given suite
   */
  private shouldRunHookForSuite(hookSuiteId: string | undefined, suiteChain: string[]): boolean {
    if (hookSuiteId === undefined) {
      return suiteChain.length === 0;
    }
    return suiteChain.includes(hookSuiteId);
  }

  /**
   * Run beforeEach hooks for requested fixtures only (lazy execution)
   * @param context Test context
   * @param suite Optional suite to filter hooks
   * @param requiredFixtures Set of fixture names requested by the test
   * @returns Augmented context with fixture values and set of executed fixture names
   */
  async runBeforeEachFor(
    context: TestContext,
    suite: TestSuite | undefined,
    requiredFixtures: Set<string>
  ): Promise<{ context: TestContext; executedFixtures: Set<string> }> {
    let augmentedContext = { ...context };
    const suiteChain = suite ? this.getSuiteChain(suite) : [];
    const executedFixtures = new Set<string>();

    for (const entry of this.namedBeforeEachHooks) {
      // Only run if fixture is requested AND belongs to correct suite
      if (
        requiredFixtures.has(entry.name) &&
        this.shouldRunHookForSuite(entry.suiteId, suiteChain)
      ) {
        const result = await entry.fn(augmentedContext);
        if (result && typeof result === 'object') {
          augmentedContext = { ...augmentedContext, ...result };
        }
        executedFixtures.add(entry.name);
      }
    }

    return { context: augmentedContext, executedFixtures };
  }

  /**
   * Run afterEach hooks for executed fixtures only
   * @param context Test context
   * @param suite Optional suite to filter hooks
   * @param executedFixtures Set of fixture names that were actually executed
   */
  async runAfterEachFor(
    context: TestContext,
    suite: TestSuite | undefined,
    executedFixtures: Set<string>
  ): Promise<void> {
    const suiteChain = suite ? this.getSuiteChain(suite) : [];

    // Run in reverse order for proper cleanup
    for (let i = this.namedAfterEachHooks.length - 1; i >= 0; i--) {
      const entry = this.namedAfterEachHooks[i];
      if (
        executedFixtures.has(entry.name) &&
        this.shouldRunHookForSuite(entry.suiteId, suiteChain)
      ) {
        await entry.fn(context);
      }
    }
  }

  /**
   * Run beforeAll hooks for a suite
   * @param suite The suite to run hooks for
   * @param inheritedContext Context inherited from parent suites
   * @returns Augmented context with values from beforeAll hooks
   */
  async runBeforeAllFor(
    suite: TestSuite,
    inheritedContext: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const hooks = this.suiteBeforeAllHooks.get(suite.id) ?? [];
    let context = { ...inheritedContext } as TestContext;

    for (const entry of hooks) {
      const result = await entry.fn(context);
      if (result && typeof result === 'object') {
        context = { ...context, ...result };
      }
    }

    return context;
  }

  /**
   * Run afterAll hooks for a suite
   * @param suite The suite to run hooks for
   * @param context Context to pass to hooks
   */
  async runAfterAllFor(
    suite: TestSuite,
    context: Record<string, unknown> = {}
  ): Promise<void> {
    const hooks = this.suiteAfterAllHooks.get(suite.id) ?? [];

    // Run in reverse order for proper cleanup
    for (let i = hooks.length - 1; i >= 0; i--) {
      const entry = hooks[i];
      await entry.fn(context as TestContext);
    }
  }

  /**
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.namedBeforeEachHooks = [];
    this.namedAfterEachHooks = [];
    this.suiteBeforeAllHooks.clear();
    this.suiteAfterAllHooks.clear();
  }
}

// Global hooks registry
export const hooksRegistry = new HooksRegistry();

/**
 * Register a named beforeEach hook with lazy execution
 * 
 * Hook runs only when test params request this fixture.
 * 
 * @param name Fixture name (must match return object key)
 * @param fn Hook; return value injected into context
 * 
 * @example
 * describe('my tests', () => {
 *   // Register 'tmpDir' fixture
 *   beforeEach('tmpDir', async () => {
 *     const tmpDir = await fs.mkdtemp('/tmp/test-');
 *     return { tmpDir };
 *   });
 * 
 *   afterEach('tmpDir', async ({ tmpDir }) => {
 *     if (tmpDir) await fs.rm(tmpDir, { recursive: true });
 *   });
 * 
 *   // This test triggers tmpDir
 *   test('uses tmpDir', async ({ terminal, tmpDir }) => {
 *     await terminal.run(`ls ${tmpDir}`);
 *   });
 * 
 *   // This test does not trigger tmpDir
 *   test('no fixture needed', async ({ terminal }) => {
 *     await terminal.run('echo hello');
 *   });
 * });
 */
export function beforeEach(name: string, fn: EnhancedHookFunction): void {
  const suiteId = registry.getCurrentSuiteId();
  hooksRegistry.registerBeforeEach(name, fn, suiteId);
}

/**
 * Register a named afterEach hook
 *
 * Runs only when matching beforeEach ran.
 *
 * @param name Fixture name (same as beforeEach)
 * @param fn Hook function
 */
export function afterEach(name: string, fn: HookFunction): void {
  const suiteId = registry.getCurrentSuiteId();
  hooksRegistry.registerAfterEach(name, fn, suiteId);
}

/**
 * Register a beforeAll hook for the current suite
 *
 * Runs once before all tests in suite.
 * Return value merged into context for all tests.
 *
 * @param fn Hook; return value injected into context
 *
 * @example
 * describe('admin tests', () => {
 *   beforeAll(async () => {
 *     const adminUser = await createAdminUser();
 *     return { adminUser };
 *   });
 *
 *   afterAll(async ({ adminUser }) => {
 *     await deleteUser(adminUser);
 *   });
 *
 *   test('admin can see dashboard', async ({ terminal, adminUser }) => {
 *     // adminUser is available from beforeAll
 *   });
 * });
 */
export function beforeAll(fn: EnhancedHookFunction): void;
export function beforeAll(name: string, fn: EnhancedHookFunction): void;
export function beforeAll(
  nameOrFn: string | EnhancedHookFunction,
  maybeFn?: EnhancedHookFunction
): void {
  const suiteId = registry.getCurrentSuiteId();
  if (!suiteId) {
    throw new Error('beforeAll must be called inside a describe() block');
  }

  const name = typeof nameOrFn === 'string' ? nameOrFn : undefined;
  const fn = typeof nameOrFn === 'function' ? nameOrFn : maybeFn!;

  hooksRegistry.registerBeforeAll(name, fn, suiteId);
}

/**
 * Register an afterAll hook for the current suite
 *
 * Runs once after all tests in suite.
 *
 * @param fn Hook function
 */
export function afterAll(fn: HookFunction): void;
export function afterAll(name: string, fn: HookFunction): void;
export function afterAll(
  nameOrFn: string | HookFunction,
  maybeFn?: HookFunction
): void {
  const suiteId = registry.getCurrentSuiteId();
  if (!suiteId) {
    throw new Error('afterAll must be called inside a describe() block');
  }

  const name = typeof nameOrFn === 'string' ? nameOrFn : undefined;
  const fn = typeof nameOrFn === 'function' ? nameOrFn : maybeFn!;

  hooksRegistry.registerAfterAll(name, fn, suiteId);
}

/**
 * Export hooks registry for runner
 */
export { hooksRegistry as hooks };
