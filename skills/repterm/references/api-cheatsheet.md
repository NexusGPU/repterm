# API 速查表

> 常用验证：`bun test packages/repterm/tests/unit`  
> 运行示例：`bun run repterm packages/repterm/examples/<file>.ts`

## 测试 DSL

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

// test(name, fn)
test('basic', async ({ terminal }) => {
  const result = await terminal.run('echo hello');
  await expect(result).toSucceed();
});

// test(name, options, fn)
test('record case', { record: true, timeout: 30_000 }, async ({ terminal }) => {
  await terminal.run('pwd');
});

// describe(name, fn)
describe('suite', () => {
  test('case 1', async ({ terminal }) => {
    await terminal.run('echo suite');
  });
});

// describe(name, options, fn)
describe('record suite', { record: true }, () => {
  test('case 2', async ({ terminal }) => {
    await terminal.waitForText('ready', { timeout: 5000 });
  });
});

// test.step()
test('step demo', async ({ terminal }) => {
  await test.step('prepare', async () => {
    await terminal.run('mkdir -p /tmp/repterm-demo');
  });

  await test.step('verify', async () => {
    const result = await terminal.run('ls /tmp/repterm-demo');
    await expect(result).toSucceed();
  });
});
```

## 终端 API

```ts
// 非交互：默认走 Bun.spawn，返回 CommandResult
const result = await terminal.run('echo hello');
console.log(result.code, result.stdout, result.stderr, result.output, result.duration);

// 录制/PTY 模式下需要精确 code 或干净 JSON 时，使用 silent
const parsed = await terminal.run('kubectl get pod x -o json', { silent: true });

// 交互：拿到 PTYProcess 控制器
const proc = terminal.run('python3', { interactive: true, timeout: 30_000 });
await proc.expect('>>>');
await proc.send('print("hi")\n');
await proc.expect('hi');
await proc.interrupt();
const finalResult = await proc.wait();

// waitForText / snapshot
await terminal.waitForText('done', { timeout: 8000, stripAnsi: true });
const snapshot = await terminal.snapshot();

// 多终端
const terminal2 = await terminal.create();
await terminal2.run('echo from second terminal');
```

## 断言 API

```ts
const result = await terminal.run('command');

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
  beforeEach(async ({ terminal }) => {
    await terminal.run('echo setup');
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

  test('fixture requested', async ({ terminal, tmpDir, shared }) => {
    await terminal.run(`touch ${tmpDir}/a`);
    await expect(shared).toBe('value');
  });
});
```

## 插件 API

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

## Kubectl 插件速查

```ts
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@repterm/plugin-kubectl';

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
