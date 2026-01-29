/**
 * Hooks (beforeEach, afterEach)
 * Provides setup and teardown functionality with context injection
 */

import type { TestContext } from '../runner/models.js';

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
 * Global hooks storage
 */
class HooksRegistry {
  private beforeEachHooks: EnhancedHookFunction[] = [];
  private afterEachHooks: HookFunction[] = [];

  /**
   * Register a beforeEach hook
   * Hook 可以返回对象，返回的属性会被注入到后续的 context 中
   */
  registerBeforeEach(fn: EnhancedHookFunction): void {
    this.beforeEachHooks.push(fn);
  }

  /**
   * Register an afterEach hook
   */
  registerAfterEach(fn: HookFunction): void {
    this.afterEachHooks.push(fn);
  }

  /**
   * Run all beforeEach hooks and return augmented context
   * 返回合并了所有 hook 返回值的增强 context
   */
  async runBeforeEach(context: TestContext): Promise<TestContext> {
    let augmentedContext = { ...context };

    for (const hook of this.beforeEachHooks) {
      const result = await hook(augmentedContext);
      if (result && typeof result === 'object') {
        // 将返回值合并到 context
        augmentedContext = { ...augmentedContext, ...result };
      }
    }

    return augmentedContext;
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
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
  }
}

// Global hooks registry
export const hooksRegistry = new HooksRegistry();

/**
 * Register a beforeEach hook
 * 
 * Hook 可以返回对象，返回的属性会被注入到后续的 context 中（包括测试函数和 afterEach）
 * 
 * @example
 * // 创建临时目录 fixture
 * beforeEach(async () => {
 *   const tmpDir = await fs.mkdtemp('/tmp/test-');
 *   return { tmpDir };  // tmpDir 会被注入到 context
 * });
 * 
 * afterEach(async ({ tmpDir }) => {
 *   if (tmpDir) await fs.rm(tmpDir, { recursive: true });
 * });
 * 
 * test('file operations', async ({ terminal, tmpDir }) => {
 *   // tmpDir 自动可用
 *   await terminal.run(`touch ${tmpDir}/test.txt`);
 * });
 */
export function beforeEach(fn: EnhancedHookFunction): void {
  hooksRegistry.registerBeforeEach(fn);
}

/**
 * Register an afterEach hook
 */
export function afterEach(fn: HookFunction): void {
  hooksRegistry.registerAfterEach(fn);
}

/**
 * Export hooks registry for runner
 */
export { hooksRegistry as hooks };
