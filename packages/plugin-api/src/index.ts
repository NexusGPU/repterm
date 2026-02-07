/**
 * repterm-api
 *
 * Types and helpers for building repterm plugins without depending on repterm.
 * Plugins depend on this package; repterm depends on it and re-exports for convenience.
 */

// ============== Minimal Test Context (for plugin typing without repterm) ==============

/** Minimal command result shape; repterm's CommandResult satisfies this. */
export interface MinimalCommandResult {
  output: string;
  code: number;
  stdout: string;
  stderr: string;
  duration?: number;
  command?: string;
}

/** Result of run() may be awaitable or a handle with start/interrupt (PTY). */
export interface MinimalRunResult extends PromiseLike<MinimalCommandResult> {
  start?(): Promise<void>;
  interrupt?(): Promise<void>;
}

/** Minimal terminal API; repterm's TerminalAPI satisfies this. */
export interface MinimalTerminal {
  run(
    command: string,
    options?: { timeout?: number; [key: string]: unknown }
  ): MinimalRunResult;
  snapshot(): Promise<string>;
  isPtyMode?(): boolean;
}

/** Minimal test context so plugins can type ctx.testContext without importing repterm. */
export interface MinimalTestContext {
  terminal: MinimalTerminal;
  [key: string]: unknown;
}

// ============== Base Context ==============

/**
 * Base context available to all plugins.
 * Defaults to MinimalTestContext so plugins get typed terminal access.
 */
export type BasePluginContext<TTestContext = MinimalTestContext> = {
  /** Repterm version */
  version: string;
  /** Debug mode enabled */
  debug: boolean;
  /** Original test context (provided by repterm at runtime) */
  testContext: TTestContext;
};

// ============== Plugin Lifecycle Hooks ==============

/**
 * Plugin lifecycle hooks.
 * Generic over context so plugin-api does not depend on repterm's TestContext.
 */
export interface PluginHooks<TContext = unknown> {
  /** Called before each test starts */
  beforeTest?: (ctx: TContext) => Promise<void> | void;
  /** Called after each test completes */
  afterTest?: (ctx: TContext, error?: Error) => Promise<void> | void;
  /** Called before terminal command is executed */
  beforeCommand?: (command: string) => Promise<string> | string;
  /** Called after terminal output is captured */
  afterOutput?: (output: string) => Promise<string> | string;
}

// ============== Plugin System Types ==============

/**
 * Plugin definition with context support.
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
    hooks?: PluginHooks<any>;
  };
  _contextIn?: TContextIn;
  _contextOut?: TContextOut;
  _methods?: TMethods;
};

/** Any plugin type for constraints */
export type AnyPlugin = PluginDefinition<string, any, any, object>;

// ============== Matcher API (for plugin custom matchers) ==============

/**
 * Result returned by a custom matcher. Use this in plugins that call expect.extend().
 */
export interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

// ============== Public API ==============

/**
 * Define a plugin with context support.
 * Use this in plugin packages; at runtime repterm will pass BasePluginContext&lt;TestContext&gt;.
 */
export function definePlugin<
  TName extends string,
  TContextIn extends object,
  TContextOut extends object,
  TMethods extends object
>(
  name: TName,
  setup: (ctx: TContextIn) => {
    methods: TMethods;
    context?: TContextOut;
    hooks?: PluginHooks<any>;
  }
): PluginDefinition<TName, TContextIn, TContextOut, TMethods> {
  return { name, setup };
}

/** Alias for plugin authors */
export type { BasePluginContext as PluginContext };
