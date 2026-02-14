/**
 * Example 17: Custom Plugins
 *
 * Run: bun run repterm examples/17-custom-plugins.ts
 *
 * Demonstrates the plugin system:
 * - definePlugin() to create plugins with methods, context, and hooks
 * - defineConfig() to configure plugin runtime
 * - createTestWithPlugins() / describeWithPlugins() for plugin-aware tests
 * - Plugin hooks: beforeTest, afterTest
 * - Context injection: plugin data available directly on test context
 *
 * Note: In plugin tests, use ctx.terminal.$ (not ctx.$) for commands.
 */

import {
  expect,
  definePlugin,
  defineConfig,
  describeWithPlugins,
  type BasePluginContext,
} from 'repterm';

// ============================================================
// Plugin 1: Logger — methods + context injection
// ============================================================

/** Define a logger plugin that tracks log entries */
function loggerPlugin() {
  return definePlugin<'logger', BasePluginContext, { logEntries: string[] }, {
    log(msg: string): void;
    getEntries(): string[];
    clear(): void;
  }>(
    'logger',
    () => {
      const entries: string[] = [];
      return {
        methods: {
          log: (msg: string) => { entries.push(msg); },
          getEntries: () => [...entries],
          clear: () => { entries.length = 0; },
        },
        // Context properties are merged into the test context
        context: { logEntries: entries },
      };
    }
  );
}

// ============================================================
// Plugin 2: Timer — hooks for automatic setup/teardown
// ============================================================

/** Define a timer plugin that auto-records test duration via hooks */
function timerPlugin() {
  return definePlugin<'timer', BasePluginContext, {}, {
    elapsed(): number;
  }>(
    'timer',
    () => {
      let startTime = 0;
      return {
        methods: {
          elapsed: () => Date.now() - startTime,
        },
        hooks: {
          // beforeTest runs automatically before each test
          beforeTest: async () => {
            startTime = Date.now();
          },
          // afterTest runs automatically after each test (receives error if failed)
          afterTest: async (_ctx, error) => {
            if (error) {
              console.log(`  [timer] test failed after ${Date.now() - startTime}ms`);
            }
          },
        },
      };
    }
  );
}

// ============================================================
// Configure plugins and create test runtime
// ============================================================

const config = defineConfig({
  plugins: [loggerPlugin(), timerPlugin()] as const,
});

// ============================================================
// Tests using describeWithPlugins
// ============================================================

describeWithPlugins(config, 'Plugin methods and context', ({ test }) => {
  test('access plugin methods via ctx.plugins.<name>', async (ctx) => {
    ctx.plugins.logger.log('step 1');
    ctx.plugins.logger.log('step 2');
    ctx.plugins.logger.log('step 3');

    const entries = ctx.plugins.logger.getEntries();
    expect(entries.length).toBe(3);
    expect(entries[0]).toBe('step 1');
    console.log(`  logger entries: [${entries.join(', ')}]`);
  });

  test('context injection — plugin data on ctx directly', async (ctx) => {
    // logEntries is injected onto the context by the logger plugin
    ctx.plugins.logger.log('hello');
    expect(ctx.logEntries).toBeDefined();
    expect(Array.isArray(ctx.logEntries)).toBe(true);
    // Same array reference as internal entries
    expect(ctx.logEntries.length).toBe(1);
    console.log(`  ctx.logEntries available: ${ctx.logEntries.length} entry`);
  });

  test('multiple plugins coexist independently', async (ctx) => {
    ctx.plugins.logger.log('logged');
    const elapsed = ctx.plugins.timer.elapsed();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(ctx.plugins.logger.getEntries().length).toBe(1);
    console.log(`  logger + timer both active, elapsed: ${elapsed}ms`);
  });
});

describeWithPlugins(config, 'Plugin hooks', ({ test }) => {
  test('beforeTest hook — timer auto-started', async (ctx) => {
    // Timer's beforeTest hook records start time automatically
    await new Promise(resolve => setTimeout(resolve, 50));
    const elapsed = ctx.plugins.timer.elapsed();
    expect(elapsed).toBeGreaterThanOrEqual(40);
    console.log(`  timer auto-started: ${elapsed}ms`);
  });

  test('plugins with terminal commands', async (ctx) => {
    ctx.plugins.logger.log('before command');
    const result = await ctx.terminal.$`echo "plugin test"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('plugin test');
    ctx.plugins.logger.log(`after command, code=${result.code}`);

    const entries = ctx.plugins.logger.getEntries();
    expect(entries.length).toBe(2);
    console.log(`  ${entries.join(' → ')}`);
  });

  test('each test gets fresh plugin state', async (ctx) => {
    // Plugins are re-initialized per test — no leakage
    expect(ctx.plugins.logger.getEntries().length).toBe(0);
    console.log(`  fresh state confirmed: 0 entries`);
  });
});
