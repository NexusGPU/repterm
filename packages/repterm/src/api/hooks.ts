/**
 * Hooks (beforeEach, afterEach) with Named Fixture Support
 * Provides setup and teardown functionality with lazy execution
 * 
 * Fixtures are only executed when tests explicitly request them via parameters.
 */

import type { TestContext, TestSuite } from '../runner/models.js';
import { registry } from './test.js';

/**
 * 基础 Hook 函数类型
 */
export type HookFunction = (context: TestContext) => Promise<void> | void;

/**
 * 增强的 Hook 函数类型，支持返回值注入
 * 返回的对象会被合并到后续的 context 中
 */
export type EnhancedHookFunction = (
  context: TestContext
) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;

/**
 * Named beforeEach hook entry (for lazy execution)
 */
interface NamedBeforeEachEntry {
  name: string; // Fixture 名称
  fn: EnhancedHookFunction;
  suiteId?: string;
}

/**
 * Named afterEach hook entry (for lazy cleanup)
 */
interface NamedAfterEachEntry {
  name: string; // Fixture 名称
  fn: HookFunction;
  suiteId?: string;
}

/**
 * Global hooks storage with named fixture support
 */
class HooksRegistry {
  private namedBeforeEachHooks: NamedBeforeEachEntry[] = [];
  private namedAfterEachHooks: NamedAfterEachEntry[] = [];

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
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.namedBeforeEachHooks = [];
    this.namedAfterEachHooks = [];
  }
}

// Global hooks registry
export const hooksRegistry = new HooksRegistry();

/**
 * Register a named beforeEach hook with lazy execution
 * 
 * 只有测试函数参数中请求了该 Fixture，才会执行此 Hook。
 * 
 * @param name Fixture 名称（必须与返回对象的 key 一致）
 * @param fn Hook 函数，返回对象会被注入到 context
 * 
 * @example
 * describe('my tests', () => {
 *   // 注册名为 'tmpDir' 的 fixture
 *   beforeEach('tmpDir', async () => {
 *     const tmpDir = await fs.mkdtemp('/tmp/test-');
 *     return { tmpDir };
 *   });
 * 
 *   afterEach('tmpDir', async ({ tmpDir }) => {
 *     if (tmpDir) await fs.rm(tmpDir, { recursive: true });
 *   });
 * 
 *   // 这个测试会触发 tmpDir fixture
 *   test('uses tmpDir', async ({ terminal, tmpDir }) => {
 *     await terminal.run(`ls ${tmpDir}`);
 *   });
 * 
 *   // 这个测试不会触发 tmpDir fixture
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
 * 只有对应的 beforeEach 被执行了，此 Hook 才会执行。
 * 
 * @param name Fixture 名称（与 beforeEach 注册的名称一致）
 * @param fn Hook 函数
 */
export function afterEach(name: string, fn: HookFunction): void {
  const suiteId = registry.getCurrentSuiteId();
  hooksRegistry.registerAfterEach(name, fn, suiteId);
}

/**
 * Export hooks registry for runner
 */
export { hooksRegistry as hooks };
