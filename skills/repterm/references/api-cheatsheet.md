# API cheatsheet

> All examples assume: `import { test, describe, expect, beforeEach, afterEach, beforeAll, afterAll } from 'repterm';`
> Verify: `bun test packages/repterm/tests/unit`
> Run example: `bun run repterm packages/repterm/examples/<file>.ts`

## Plugin manager CLI

```bash
# Search plugins from current npm registry (Bun-only package management)
repterm plugin search kubernetes

# List installed repterm plugins in current project
repterm plugin list

# Install / remove / update plugins (uses bun add/remove/update)
repterm plugin install @nexusgpu/repterm-plugin-kubectl
repterm plugin uninstall @nexusgpu/repterm-plugin-kubectl
repterm plugin update
```

Notes:
- Registry resolution order: `NPM_CONFIG_REGISTRY` -> project `.npmrc` -> user `.npmrc` -> npmjs.
- `install` and `update` verify plugin importability after Bun completes.

## Test DSL

```ts
// test(name, fn) — use $ tagged template for commands (recommended)
test('basic', async ({ $ }) => {
  const result = await $`echo hello`;
  await expect(result).toSucceed();
});

// test(name, options, fn)  — options: { record?: boolean, timeout?: number }
test('record case', { record: true, timeout: 30_000 }, async ({ $ }) => {
  await $`pwd`;
});

// describe(name, fn)
describe('suite', () => {
  test('case 1', async ({ $ }) => {
    await $`echo suite`;
  });
});

// describe(name, options, fn)  — options: { record?: boolean }
describe('record suite', { record: true }, () => {
  test('case 2', async ({ terminal }) => {
    await terminal.waitForText('ready', { timeout: 5000 });
  });
});

// test.step(name, fn)  — or test.step(name, options, fn)
test('step demo', async ({ $ }) => {
  await test.step('prepare', async () => {
    await $`mkdir -p /tmp/repterm-demo`;
  });

  // StepRecordingOptions: { typingSpeed?, pauseAfter?, pauseBefore?, showStepTitle? }
  await test.step('verify', { showStepTitle: true, pauseAfter: 1000 }, async () => {
    const result = await $`ls /tmp/repterm-demo`;
    await expect(result).toSucceed();
  });
});
```

## Terminal API

### RunOptions (all fields)

```ts
interface RunOptions {
  timeout?: number;        // Command timeout ms (default: 30000)
  env?: Record<string, string>;  // Environment variables
  cwd?: string;            // Working directory
  interactive?: boolean;   // PTY mode with expect/send control
  silent?: boolean;        // Force Bun.spawn even in recording (for JSON/exit code)
  typingSpeed?: number;    // Recording: ms per character (default: 80, 0 = instant)
  pauseAfter?: number;     // Recording: pause after command (ms)
  pauseBefore?: number;    // Recording: pause before command (ms)
  promptDetection?: 'auto' | 'osc133' | 'sentinel' | 'regex' | 'none';
    // 'auto' (default): best available; 'none': skip (for long-running commands)
}
```

### $ tagged template

```ts
// Basic usage (auto-escapes interpolated values)
const result = await $`echo hello`;
console.log(result.code, result.stdout, result.stderr, result.output, result.duration);

// Interpolation: values are shell-escaped
const name = "hello world";
await $`echo ${name}`;  // runs: echo 'hello world'

// Skip escaping with raw()
import { raw } from 'repterm';
await $`echo ${raw('already-safe')}`;

// With options
await $({ timeout: 5000 })`echo hello`;
await $({ silent: true })`kubectl get pod x -o json`;
await $({ promptDetection: 'none' })`tail -f /var/log/syslog`;
```

### PTYProcess (returned by $ and terminal.run())

```ts
// Await for CommandResult
const result = await $`echo hello`;

// Or use as controller for interactive commands
const proc = $({ interactive: true, timeout: 30_000 })`python3`;
await proc.expect('>>>');          // Wait for text
await proc.send('print("hi")\n'); // Send input (appends newline)
await proc.sendRaw('data');        // Send raw input (no newline)
await proc.start();                // Start without waiting for finish
await proc.interrupt();            // Send Ctrl+C
const result = await proc.wait();  // Wait for completion
```

### Terminal methods

```ts
terminal.run(command, options?)    // Execute command, returns PTYProcess
terminal.$`cmd`                    // Tagged template bound to terminal
terminal.send(text)                // Send input to terminal
terminal.waitForText(text, { timeout?, stripAnsi? })  // Wait for text
terminal.snapshot()                // Get current output
terminal.create()                  // Create new terminal (splits pane in recording)
terminal.close()                   // Close terminal
terminal.isRecording()             // Check recording mode
terminal.isPtyMode()               // Check PTY mode (recording or ptyOnly)
```

## Assertion API

```ts
const result = await $`command`;

// CommandResult
await expect(result).toSucceed();
await expect(result).toFail();
await expect(result).toHaveExitCode(0);
await expect(result).toContainInOutput('text');
await expect(result).toHaveStdout('partial stdout');
await expect(result).toHaveStderr('partial stderr');
await expect(result).toMatchStdout(/ready/i);
await expect(result).toMatchStderr(/error/i);

// Terminal
await expect(terminal).toContainText('prompt');
await expect(terminal).toMatchPattern(/\$\s/);
```

## Hooks

Named beforeEach/afterEach hooks are **lazy** — only executed if the test function requests that fixture by name in its destructured parameters.

```ts
describe('hooks', () => {
  beforeEach(async ({ $ }) => {
    await $`echo setup`;
  });

  // Named fixture (lazy: only runs if test requests 'tmpDir')
  beforeEach('tmpDir', async () => {
    const dir = `/tmp/repterm-${Date.now()}`;
    await Bun.$`mkdir -p ${dir}`;
    return dir;
  });

  afterEach('tmpDir', async (tmpDir) => {
    await Bun.$`rm -rf ${tmpDir}`;
  });

  // beforeAll/afterAll also support optional naming
  beforeAll(async () => {
    return { shared: 'value' };
  });

  afterAll(async ({ shared }) => {
    void shared;
  });

  // 'tmpDir' fixture runs because it's requested here
  test('fixture requested', async ({ $, tmpDir, shared }) => {
    await $`touch ${tmpDir}/a`;
    await expect(shared).toBe('value');
  });
});
```

## Plugin API

```ts
import { definePlugin, defineConfig, createTestWithPlugins, describeWithPlugins } from 'repterm';

const loggerPlugin = definePlugin(
  'logger',
  () => ({
    methods: {
      info: (msg: string) => console.log('[info]', msg),
    },
    context: {
      loggerName: 'default-logger',
    },
    // Optional lifecycle hooks:
    hooks: {
      beforeTest: async (ctx) => { /* runs before each test */ },
      afterTest: async (ctx, error?) => { /* runs after each test */ },
      beforeCommand: (command: string) => command, // transform command
      afterOutput: (output: string) => output,     // transform output
    },
  })
);

const config = defineConfig({
  plugins: [loggerPlugin] as const,
});

const test = createTestWithPlugins(config);

// describeWithPlugins also available for suite-level plugin injection
// describeWithPlugins(config, 'suite name', () => { ... });

test('plugin demo', async (ctx) => {
  ctx.plugins.logger.info('hello');
  await expect(ctx.loggerName).toBe('default-logger');
});
```

> For kubectl plugin API and patterns, see `references/plugin-kubectl.md`.
