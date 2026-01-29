/**
 * Repterm Plugin System
 *
 * A type-safe plugin system that allows extending test contexts and terminal APIs.
 * Based on the plugin design pattern with context accumulation and full type inference.
 *
 * Features:
 * - Plugin-based context extension
 * - Context accumulation between plugins
 * - Full TypeScript type inference
 * - Terminal API augmentation
 * - Lifecycle hooks
 */

import type { TestContext } from '../runner/models.js';

// ============== Base Context ==============

/**
 * Base context available to all plugins
 */
export type BasePluginContext = {
    /** Repterm version */
    version: string;
    /** Debug mode enabled */
    debug: boolean;
    /** Original test context */
    testContext: TestContext;
};

// ============== Plugin Lifecycle Hooks ==============

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
    /** Called before each test starts */
    beforeTest?: (ctx: TestContext) => Promise<void> | void;
    /** Called after each test completes */
    afterTest?: (ctx: TestContext, error?: Error) => Promise<void> | void;
    /** Called before terminal command is executed */
    beforeCommand?: (command: string) => Promise<string> | string;
    /** Called after terminal output is captured */
    afterOutput?: (output: string) => Promise<string> | string;
}

// ============== Plugin System Types ==============

/**
 * Plugin definition with context support
 * @template TName - Plugin name (becomes accessible via context.plugins.name)
 * @template TContextIn - Input context type the plugin expects
 * @template TContextOut - Context augmentation the plugin provides
 * @template TMethods - Methods the plugin exports
 */
export type PluginDefinition<
    TName extends string,
    TContextIn extends object,
    TContextOut extends object,
    TMethods extends object
> = {
    name: TName;
    setup: (ctx: TContextIn) => {
        methods: TMethods;
        context?: TContextOut;
        hooks?: PluginHooks;
    };
    // Type markers for inference
    _contextIn?: TContextIn;
    _contextOut?: TContextOut;
    _methods?: TMethods;
};

/** Any plugin type for constraints */
export type AnyPlugin = PluginDefinition<string, any, any, object>;

// ============== Type Helpers ==============

/** Extract context output from a plugin */
type ExtractContextOut<T> = T extends PluginDefinition<any, any, infer Out, any> ? Out : {};

/** Extract methods from a plugin */
type ExtractMethods<T> = T extends PluginDefinition<any, any, any, infer M> ? M : {};

/** Extract name from a plugin */
type ExtractName<T> = T extends PluginDefinition<infer N, any, any, any> ? N : never;

/** Merge plugin methods into plugins namespace (plugins.pluginName.method style) */
type MergePluginMethods<TPlugins extends readonly AnyPlugin[]> = TPlugins extends readonly [
    infer First,
    ...infer Rest
]
    ? Rest extends readonly AnyPlugin[]
    ? { [K in ExtractName<First>]: ExtractMethods<First> } & MergePluginMethods<Rest>
    : { [K in ExtractName<First>]: ExtractMethods<First> }
    : {};

/** Accumulate context from all plugins */
type AccumulateContext<TPlugins extends readonly AnyPlugin[], TAccum extends object = {}> =
    TPlugins extends readonly [infer First, ...infer Rest]
    ? Rest extends readonly AnyPlugin[]
    ? AccumulateContext<Rest, TAccum & ExtractContextOut<First>>
    : TAccum & ExtractContextOut<First>
    : TAccum;

// ============== Augmented Test Context ==============

/**
 * Augmented test context with plugin methods and accumulated context
 */
export type AugmentedTestContext<TPlugins extends readonly AnyPlugin[]> = TestContext & {
    plugins: MergePluginMethods<TPlugins>;
} & AccumulateContext<TPlugins>;

// ============== Plugin Configuration ==============

/**
 * Plugin configuration options
 */
export interface PluginConfig<TPlugins extends readonly AnyPlugin[]> {
    /** List of plugins to load */
    plugins?: TPlugins;
    /** Base context options */
    baseContext?: Partial<Omit<BasePluginContext, 'testContext'>>;
}

// ============== Runtime Implementation ==============

/**
 * Plugin runtime that manages plugin lifecycle and context
 */
export class PluginRuntime<TPlugins extends readonly AnyPlugin[]> {
    private plugins: TPlugins;
    private baseContext: Omit<BasePluginContext, 'testContext'>;
    private pluginMethods: Record<string, any> = {};
    private pluginHooks: PluginHooks[] = [];
    private contextAugmentations: Record<string, unknown> = {};

    constructor(config: PluginConfig<TPlugins>) {
        this.plugins = (config.plugins || []) as TPlugins;
        this.baseContext = {
            version: '1.0.0',
            debug: false,
            ...config.baseContext,
        };
    }

    /**
     * Initialize plugins with a test context
     */
    initialize(testContext: TestContext): AugmentedTestContext<TPlugins> {
        const fullContext: BasePluginContext = {
            ...this.baseContext,
            testContext,
        };

        let ctx: any = { ...fullContext };

        // Initialize each plugin with accumulated context
        for (const plugin of this.plugins) {
            const result = plugin.setup(ctx);

            // Store methods under plugin name
            this.pluginMethods[plugin.name] = result.methods;

            // Collect hooks
            if (result.hooks) {
                this.pluginHooks.push(result.hooks);
            }

            // Merge context augmentation
            if (result.context) {
                ctx = { ...ctx, ...result.context };
                Object.assign(this.contextAugmentations, result.context);
            }
        }

        // Create augmented test context
        const augmentedContext: any = {
            ...testContext,
            plugins: this.pluginMethods,
            ...this.contextAugmentations,
        };

        return augmentedContext as AugmentedTestContext<TPlugins>;
    }

    /**
     * Run beforeTest hooks
     */
    async runBeforeTestHooks(ctx: TestContext): Promise<void> {
        for (const hooks of this.pluginHooks) {
            if (hooks.beforeTest) {
                await hooks.beforeTest(ctx);
            }
        }
    }

    /**
     * Run afterTest hooks
     */
    async runAfterTestHooks(ctx: TestContext, error?: Error): Promise<void> {
        for (const hooks of this.pluginHooks) {
            if (hooks.afterTest) {
                await hooks.afterTest(ctx, error);
            }
        }
    }

    /**
     * Run beforeCommand hooks
     */
    async runBeforeCommandHooks(command: string): Promise<string> {
        let result = command;
        for (const hooks of this.pluginHooks) {
            if (hooks.beforeCommand) {
                result = await hooks.beforeCommand(result);
            }
        }
        return result;
    }

    /**
     * Run afterOutput hooks
     */
    async runAfterOutputHooks(output: string): Promise<string> {
        let result = output;
        for (const hooks of this.pluginHooks) {
            if (hooks.afterOutput) {
                result = await hooks.afterOutput(result);
            }
        }
        return result;
    }
}

// ============== Public API ==============

/**
 * Define a plugin with context support
 *
 * @param name - Plugin name (becomes accessible via ctx.plugins.name)
 * @param setup - Setup function receiving context and returning methods + optional context augmentation
 *
 * @example
 * ```ts
 * const myPlugin = definePlugin<
 *   'myPlugin',
 *   BasePluginContext,
 *   { customField: string },
 *   { myMethod: (arg: string) => void }
 * >('myPlugin', (ctx) => ({
 *   methods: {
 *     myMethod: (arg) => console.log(arg),
 *   },
 *   context: { customField: 'value' },
 * }));
 * ```
 */
export function definePlugin<
    TName extends string,
    TContextIn extends object,
    TContextOut extends object,
    TMethods extends object
>(
    name: TName,
    setup: (ctx: TContextIn) => { methods: TMethods; context?: TContextOut; hooks?: PluginHooks }
): PluginDefinition<TName, TContextIn, TContextOut, TMethods> {
    return { name, setup };
}

/**
 * Create a plugin runtime with the given configuration
 *
 * @param config - Plugin configuration
 * @returns Plugin runtime instance
 *
 * @example
 * ```ts
 * import { defineConfig, definePlugin } from './plugin';
 *
 * const config = defineConfig({
 *   plugins: [myPlugin, anotherPlugin] as const,
 *   baseContext: { debug: true },
 * });
 *
 * // In test execution:
 * const ctx = config.initialize(testContext);
 * ctx.plugins.myPlugin.myMethod('hello');
 * ```
 */
export function defineConfig<TPlugins extends readonly AnyPlugin[]>(
    config: PluginConfig<TPlugins>
): PluginRuntime<TPlugins> {
    return new PluginRuntime(config);
}

/**
 * Re-export base context type for plugin authors
 */
export { BasePluginContext as PluginContext };

/**
 * Re-export plugin integration helpers
 */
export {
    createTestWithPlugins,
    describeWithPlugins,
    type PluginTestFunction,
} from './withPlugins.js';
