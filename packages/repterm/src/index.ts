/**
 * Repterm - CLI/TUI Test Framework
 * 
 * Public API entrypoint following Modern, Declarative conventions
 */

// Core test registration and execution
export { test, getTests, clearTests, registry } from './api/test.js';
export {
  expect,
  TerminalExpect,
  CommandResultExpect,
  GenericExpect,
  AssertionError,
  type MatcherResult,
  type MatcherContext,
  type MatcherFunction,
  type ExpectWithExtend,
} from './api/expect.js';

// Test organization features
export { describe } from './api/describe.js';
export { step } from './api/steps.js';
export { beforeEach, afterEach, beforeAll, afterAll } from './api/hooks.js';

// Re-export types for user convenience
export type { TestContext, TerminalAPI, WaitOptions, CommandResult, RunOptions, PTYProcess, NamedHookEntry } from './runner/models.js';
export type { TestFunction, TestOptions, DescribeOptions } from './runner/models.js';
export type { HookFunction, EnhancedHookFunction } from './api/hooks.js';

// Plugin system
export {
  definePlugin,
  defineConfig,
  createTestWithPlugins,
  describeWithPlugins,
  type PluginDefinition,
  type AnyPlugin,
  type PluginConfig,
  type PluginHooks,
  type BasePluginContext,
  type AugmentedTestContext,
  type PluginTestFunction,
} from './plugin/index.js';

// Attach step to test namespace for test.step() syntax
import { test as testFn } from './api/test.js';
import { step as stepFn } from './api/steps.js';
import { describe as describeFn } from './api/describe.js';

// Extend test with additional methods
Object.assign(testFn, {
  step: stepFn,
  describe: describeFn,
});
