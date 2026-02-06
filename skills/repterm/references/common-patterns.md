# 常见代码模式

> 这些模板对齐当前源码签名，可直接复制后微调。

## 1. 基础测试

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

## 2. 录制与 PTY-only

```ts
import { test, describe } from 'repterm';

// 全 suite 标记 record: true
// - CLI 不带 --record：进入 PTY-only（无 cast）
// - CLI 带 --record：进入完整录制（asciinema + tmux）
describe('recordable suite', { record: true }, () => {
  test('demo', async ({ terminal }) => {
    await terminal.run('ls -la');
    await terminal.waitForText('total');
  });
});

// 单测标记
test('single record case', { record: true }, async ({ terminal }) => {
  await terminal.run('pwd');
});
```

## 3. 交互命令

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

## 4. Hooks + 懒加载 Fixture

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

## 5. 多终端

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

## 6. 插件接入（defineConfig）

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

## 7. Kubectl 插件

```ts
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@repterm/plugin-kubectl';

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

  // watch 模式需要手动中断
  const watch = await k.get('pods', undefined, { watch: true, output: 'wide' });
  await watch.interrupt();
});
```

## 8. 调试输出

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
