/**
 * Repterm Plugin System
 *
 * A type-safe plugin system that allows extending test contexts and terminal APIs.
 * Types and definePlugin come from repterm-api; runtime lives here.
 */

import type { TestContext } from '../runner/models.js';
import type { DollarFunction } from '../terminal/dollar.js';
import type {
  BasePluginContext as BasePluginContextGeneric,
  PluginHooks,
  PluginDefinition,
  AnyPlugin,
} from 'repterm-api';

// Inline definePlugin to avoid runtime dependency on repterm-api.
// This prevents "Cannot find package 'repterm-api'" errors when repterm
// is installed via symlink/link outside its monorepo.
function definePlugin<
  TName extends string,
  TContextIn extends object,
  TContextOut extends object,
  TMethods extends object,
>(
  name: TName,
  setup: (ctx: TContextIn) => {
    methods: TMethods;
    context?: TContextOut;
    hooks?: PluginHooks<any>;
  },
): PluginDefinition<TName, TContextIn, TContextOut, TMethods> {
  return { name, setup };
}

export { definePlugin };
export type { PluginDefinition, AnyPlugin, PluginHooks };
export type BasePluginContext = BasePluginContextGeneric<TestContext>;

// ============== Type Helpers ==============

type ExtractContextOut<T> = T extends PluginDefinition<string, any, infer Out, any> ? Out : {};
type ExtractMethods<T> = T extends PluginDefinition<string, any, any, infer M> ? M : {};
type ExtractName<T> = T extends { name: infer N extends string } ? N : never;

type UnionToIntersection<T> =
  (T extends unknown ? (arg: T) => void : never) extends (arg: infer U) => void ? U : never;

type MergePluginMethods<TPlugins extends readonly AnyPlugin[]> = {
  [P in TPlugins[number] as ExtractName<P>]: ExtractMethods<P>;
};

type AccumulateContext<TPlugins extends readonly AnyPlugin[]> =
  UnionToIntersection<ExtractContextOut<TPlugins[number]>> extends infer TContext
    ? [TContext] extends [never]
      ? {}
      : TContext
    : {};

// ============== Augmented Test Context ==============

export type AugmentedTestContext<TPlugins extends readonly AnyPlugin[]> = TestContext & {
  $: DollarFunction;
  plugins: MergePluginMethods<TPlugins>;
} & AccumulateContext<TPlugins>;

// ============== Plugin Configuration ==============

export interface PluginConfig<TPlugins extends readonly AnyPlugin[]> {
  plugins?: TPlugins;
  baseContext?: Partial<Omit<BasePluginContextGeneric<TestContext>, 'testContext'>>;
}

// ============== Runtime Implementation ==============

export class PluginRuntime<TPlugins extends readonly AnyPlugin[]> {
  private plugins: TPlugins;
  private baseContext: Omit<BasePluginContextGeneric<TestContext>, 'testContext'>;
  private pluginMethods: Partial<MergePluginMethods<TPlugins>> = {};
  private pluginHooks: PluginHooks<TestContext>[] = [];
  private contextAugmentations: Partial<AccumulateContext<TPlugins>> = {};

  constructor(config: PluginConfig<TPlugins>) {
    this.plugins = (config.plugins || []) as TPlugins;
    this.baseContext = {
      version: '1.0.0',
      debug: false,
      ...config.baseContext,
    };
  }

  initialize(testContext: TestContext): AugmentedTestContext<TPlugins> {
    const fullContext: BasePluginContextGeneric<TestContext> = {
      ...this.baseContext,
      testContext,
    };

    let ctx: BasePluginContextGeneric<TestContext> & Record<string, unknown> = {
      ...fullContext,
    };

    for (const plugin of this.plugins) {
      const result = plugin.setup(ctx);

      this.pluginMethods = {
        ...this.pluginMethods,
        [plugin.name]: result.methods,
      } as Partial<MergePluginMethods<TPlugins>>;

      if (result.hooks) {
        this.pluginHooks.push(result.hooks as PluginHooks<TestContext>);
      }

      if (result.context) {
        this.contextAugmentations = {
          ...this.contextAugmentations,
          ...result.context,
        };
        ctx = { ...ctx, ...result.context };
      }
    }

    const augmentedContext = {
      ...testContext,
      plugins: this.pluginMethods,
      ...this.contextAugmentations,
    };

    return augmentedContext as AugmentedTestContext<TPlugins>;
  }

  async runBeforeTestHooks(ctx: TestContext): Promise<void> {
    for (const hooks of this.pluginHooks) {
      if (hooks.beforeTest) {
        await hooks.beforeTest(ctx);
      }
    }
  }

  async runAfterTestHooks(ctx: TestContext, error?: Error): Promise<void> {
    for (const hooks of this.pluginHooks) {
      if (hooks.afterTest) {
        await hooks.afterTest(ctx, error);
      }
    }
  }

  async runBeforeCommandHooks(command: string): Promise<string> {
    let result = command;
    for (const hooks of this.pluginHooks) {
      if (hooks.beforeCommand) {
        result = await hooks.beforeCommand(result);
      }
    }
    return result;
  }

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

export function defineConfig<TPlugins extends readonly AnyPlugin[]>(
  config: PluginConfig<TPlugins>
): PluginRuntime<TPlugins> {
  return new PluginRuntime(config);
}

export { BasePluginContext as PluginContext };

export {
  createTestWithPlugins,
  describeWithPlugins,
  type PluginTestFunction,
} from './withPlugins.js';
