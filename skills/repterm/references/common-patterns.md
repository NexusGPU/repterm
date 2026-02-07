# Common code patterns

> Templates match current API; copy and adjust.

## 1. Basic test

```ts
import { test, expect, describe } from 'repterm';

describe('basic', () => {
  test('success command', async ({ terminal }) => {
    const result = await terminal.run('echo "Hello"');
    await expect(result).toSucceed();
    await expect(result).toContainInOutput('Hello');
  });

  test('failure command', async ({ terminal }) => {
    const result = await terminal.run('cat /definitely-not-exists');
    await expect(result).toFail();
    await expect(result).toHaveStderr('No such file');
  });
});
```

## 2. Recording and PTY-only

```ts
import { test, describe } from 'repterm';

// Whole suite record: true
// - CLI without --record: PTY-only (no cast)
// - CLI with --record: full recording (asciinema + tmux)
describe('recordable suite', { record: true }, () => {
  test('demo', async ({ terminal }) => {
    await terminal.run('ls -la');
    await terminal.waitForText('total');
  });
});

// Single test marker
test('single record case', { record: true }, async ({ terminal }) => {
  await terminal.run('pwd');
});
```

## 3. Interactive commands

```ts
import { test } from 'repterm';

test('interactive python', async ({ terminal }) => {
  const proc = terminal.run('python3', { interactive: true, timeout: 30_000 });

  await proc.expect('>>>');
  await proc.send('print("hi")\n');
  await proc.expect('hi');

  await proc.send('exit()\n');
  await proc.wait();
});
```

## 4. Hooks + lazy fixtures

```ts
import { test, describe, beforeEach, afterEach, beforeAll, afterAll, expect } from 'repterm';

describe('fixtures', () => {
  beforeAll(async () => ({ rootDir: '/tmp/repterm-suite' }));

  beforeEach('tmpDir', async ({ rootDir }) => {
    const tmpDir = `${rootDir}/${Date.now()}`;
    await Bun.$`mkdir -p ${tmpDir}`;
    return tmpDir;
  });

  afterEach('tmpDir', async (tmpDir) => {
    await Bun.$`rm -rf ${tmpDir}`;
  });

  afterAll(async ({ rootDir }) => {
    await Bun.$`rm -rf ${rootDir}`;
  });

  test('uses fixture', async ({ terminal, tmpDir }) => {
    await terminal.run(`touch ${tmpDir}/a.txt`);
    const result = await terminal.run(`ls ${tmpDir}`);
    await expect(result).toContainInOutput('a.txt');
  });
});
```

## 5. Multi-terminal

```ts
import { test, expect, describe } from 'repterm';

describe('multi terminal', { record: true }, () => {
  test('share file', async ({ terminal }) => {
    const terminal2 = await terminal.create();

    await terminal.run('echo message > /tmp/shared.txt');
    const result = await terminal2.run('cat /tmp/shared.txt');

    await expect(result).toContainInOutput('message');
  });
});
```

## 6. Plugin setup (defineConfig)

```ts
import { defineConfig, definePlugin, createTestWithPlugins, expect } from 'repterm';

const tracePlugin = definePlugin('trace', () => ({
  methods: {
    mark: async (name: string) => Bun.write('/tmp/trace.log', `${name}\n`),
  },
  context: { traceEnabled: true },
}));

const config = defineConfig({
  plugins: [tracePlugin] as const,
});

const test = createTestWithPlugins(config);

test('plugin test', async (ctx) => {
  await ctx.plugins.trace.mark('started');
  await expect(ctx.traceEnabled).toBe(true);
});
```

## 7. Kubectl plugin

```ts
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@nexusgpu/repterm-plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

test('deployment ready', async (ctx) => {
  const k = ctx.plugins.kubectl;

  await k.apply(manifestYaml);
  await k.waitForPod('demo', 'Running', 60_000);

  await expect(pod(k, 'demo')).toBeRunning();
  await expect(deployment(k, 'demo')).toHaveReadyReplicas(2);

  // watch must be interrupted
  const watch = await k.get('pods', undefined, { watch: true, output: 'wide' });
  await watch.interrupt();
});
```

## 8. Debug output

```ts
import { test } from 'repterm';

test('debug command', async ({ terminal }) => {
  const result = await terminal.run('complex-command');

  console.log('code:', result.code);
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);

  const snapshot = await terminal.snapshot();
  console.log('snapshot:', snapshot);
});
```

## See Also

- [api-cheatsheet.md](api-cheatsheet.md)
- [terminal-modes.md](terminal-modes.md)
- [troubleshooting.md](troubleshooting.md)
