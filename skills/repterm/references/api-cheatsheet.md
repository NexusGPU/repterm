# API cheatsheet

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
import {
  test,
  describe,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'repterm';

// test(name, fn) — use $ tagged template for commands (recommended)
test('basic', async ({ $ }) => {
  const result = await $`echo hello`;
  await expect(result).toSucceed();
});

// test(name, options, fn)
test('record case', { record: true, timeout: 30_000 }, async ({ $ }) => {
  await $`pwd`;
});

// describe(name, fn)
describe('suite', () => {
  test('case 1', async ({ $ }) => {
    await $`echo suite`;
  });
});

// describe(name, options, fn)
describe('record suite', { record: true }, () => {
  test('case 2', async ({ terminal }) => {
    await terminal.waitForText('ready', { timeout: 5000 });
  });
});

// test.step()
test('step demo', async ({ $ }) => {
  await test.step('prepare', async () => {
    await $`mkdir -p /tmp/repterm-demo`;
  });

  await test.step('verify', async () => {
    const result = await $`ls /tmp/repterm-demo`;
    await expect(result).toSucceed();
  });
});

// Interpolation with automatic shell escaping
test('interpolation', async ({ $ }) => {
  const name = "hello world";
  await $`echo ${name}`;  // becomes: echo 'hello world'
});

// terminal.run() still works for backward compatibility
test('legacy', async ({ terminal }) => {
  const result = await terminal.run('echo hello');
  await expect(result).toSucceed();
});
```

## Terminal API

```ts
// Recommended: $ tagged template literal (auto-escapes interpolated values)
const result = await $`echo hello`;
console.log(result.code, result.stdout, result.stderr, result.output, result.duration);

// With interpolation (values are automatically shell-escaped)
const name = "hello world";
await $`echo ${name}`;  // runs: echo 'hello world'

// With options
await $({ timeout: 5000 })`echo hello`;

// Use silent for exact code or clean JSON in recording/PTY
const parsed = await $({ silent: true })`kubectl get pod x -o json`;

// Interactive: use terminal.run() with interactive option, then use controller
const proc = terminal.run('python3', { interactive: true, timeout: 30_000 });
await proc.expect('>>>');
await proc.send('print("hi")\n');
await proc.expect('hi');
await proc.interrupt();
const finalResult = await proc.wait();

// waitForText / snapshot
await terminal.waitForText('done', { timeout: 8000, stripAnsi: true });
const snapshot = await terminal.snapshot();

// Multi-terminal
const terminal2 = await terminal.create();
await terminal2.$`echo from second terminal`;

// Legacy: terminal.run() still works
const result2 = await terminal.run('echo hello');
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

```ts
describe('hooks', () => {
  beforeEach(async ({ $ }) => {
    await $`echo setup`;
  });

  beforeEach('tmpDir', async () => {
    const dir = `/tmp/repterm-${Date.now()}`;
    await Bun.$`mkdir -p ${dir}`;
    return dir;
  });

  afterEach('tmpDir', async (tmpDir) => {
    await Bun.$`rm -rf ${tmpDir}`;
  });

  beforeAll(async () => {
    return { shared: 'value' };
  });

  afterAll(async ({ shared }) => {
    void shared;
  });

  test('fixture requested', async ({ $, tmpDir, shared }) => {
    await $`touch ${tmpDir}/a`;
    await expect(shared).toBe('value');
  });
});
```

## Plugin API

```ts
import { definePlugin, defineConfig, createTestWithPlugins } from 'repterm';

const loggerPlugin = definePlugin(
  'logger',
  () => ({
    methods: {
      info: (msg: string) => console.log('[info]', msg),
    },
    context: {
      loggerName: 'default-logger',
    },
  })
);

const config = defineConfig({
  plugins: [loggerPlugin] as const,
});

const test = createTestWithPlugins(config);

test('plugin demo', async (ctx) => {
  ctx.plugins.logger.info('hello');
  await expect(ctx.loggerName).toBe('default-logger');
});
```

## Kubectl plugin cheatsheet

```ts
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@nexusgpu/repterm-plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

test('k8s demo', async (ctx) => {
  const k = ctx.plugins.kubectl;

  await k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: demo
spec:
  containers:
  - name: demo
    image: nginx
`);

  await k.waitForPod('demo', 'Running', 60_000);
  await expect(pod(k, 'demo')).toBeRunning();

  const watch = await k.get('pods', undefined, { watch: true, output: 'wide' });
  await watch.interrupt();

  await expect(deployment(k, 'api')).toHaveReadyReplicas(2);
});
```

## See Also

- [common-patterns.md](common-patterns.md)
- [plugin-kubectl.md](plugin-kubectl.md)
- [terminal-modes.md](terminal-modes.md)
