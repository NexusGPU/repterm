/**
 * Plugin Integration Helpers
 *
 * Provides utilities to seamlessly integrate plugins with the test framework,
 * eliminating the need for manual initialization in every test case.
 */

import { test as baseTest } from '../api/test.js';
import { describe as describeFromDescribe } from '../api/describe.js';
import type { PluginRuntime, AnyPlugin, AugmentedTestContext } from './index.js';

/**
 * Type for the augmented test function that receives plugin context
 */
export type PluginTestFunction<TPlugins extends readonly AnyPlugin[]> = (
    ctx: AugmentedTestContext<TPlugins>
) => Promise<void>;

/**
 * Creates a test function that automatically initializes plugins
 *
 * @param config - The plugin runtime configuration
 * @returns A wrapped test function with automatic plugin initialization
 *
 * @example
 * ```ts
 * import { defineConfig } from 'repterm';
 * import { createTestWithPlugins } from 'repterm/plugin/withPlugins';
 * import { loggerPlugin } from './plugins/logger';
 *
 * const config = defineConfig({
 *   plugins: [loggerPlugin()] as const,
 * });
 *
 * const test = createTestWithPlugins(config);
 *
 * test('my test', async (ctx) => {
 *   // ctx automatically includes all plugins!
 *   ctx.logger.info('Hello!');
 *   ctx.plugins.logger.log('info', 'World!');
 * });
 * ```
 */
export function createTestWithPlugins<TPlugins extends readonly AnyPlugin[]>(
    config: PluginRuntime<TPlugins>
) {
    /**
     * Wrapped test function with automatic plugin initialization
     */
    function testWithPlugins(
        name: string,
        fn: PluginTestFunction<TPlugins>
    ): void {
        baseTest(name, async ({ terminal }) => {
            // Create plugin factory for new terminals
            const pluginFactory = (newTerminal: typeof terminal) => {
                // Initialize plugins with new terminal context
                const newCtx = config.initialize({ terminal: newTerminal });
                return newCtx.plugins;
            };

            // Inject plugin factory into terminal
            terminal.setPluginFactory?.(pluginFactory);

            // Initialize plugins with test context
            const augmentedCtx = config.initialize({ terminal });

            // Run beforeTest hooks
            await config.runBeforeTestHooks({ terminal });

            try {
                // Execute the test with augmented context
                await fn(augmentedCtx);

                // Run afterTest hooks (success)
                await config.runAfterTestHooks({ terminal });
            } catch (error) {
                // Run afterTest hooks (failure)
                await config.runAfterTestHooks({ terminal }, error as Error);
                throw error;
            }
        });
    }

    return testWithPlugins;
}

/**
 * Creates a describe block where all tests automatically have plugin access
 *
 * @param config - The plugin runtime configuration
 * @param name - The describe block name
 * @param fn - The describe block callback
 *
 * @example
 * ```ts
 * import { defineConfig } from 'repterm';
 * import { describeWithPlugins } from 'repterm/plugin/withPlugins';
 * import { loggerPlugin } from './plugins/logger';
 *
 * const config = defineConfig({
 *   plugins: [loggerPlugin()] as const,
 * });
 *
 * describeWithPlugins(config, 'My Suite', ({ test }) => {
 *   test('test 1', async (ctx) => {
 *     ctx.logger.info('Auto-initialized!');
 *   });
 *
 *   test('test 2', async (ctx) => {
 *     ctx.logger.debug('Same here!');
 *   });
 * });
 * ```
 */
export function describeWithPlugins<TPlugins extends readonly AnyPlugin[]>(
    config: PluginRuntime<TPlugins>,
    name: string,
    fn: (helpers: {
        test: ReturnType<typeof createTestWithPlugins<TPlugins>>;
        describe: typeof describeFromDescribe;
    }) => void
): void {
    describeFromDescribe(name, () => {
        const test = createTestWithPlugins(config);
        fn({ test, describe: describeFromDescribe });
    });
}
