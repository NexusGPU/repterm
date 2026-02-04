# API 速查表

> 运行全部单测：`bun test packages/repterm/tests`  
> 运行示例：`bun src/cli/index.ts packages/repterm/examples/<file>.ts`

## 测试定义

```typescript
import { test, expect, describe, beforeEach, afterEach, beforeAll, afterAll } from 'repterm';

// 基础测试
test('test name', async ({ terminal }) => {
  // test body
});

// 带选项的测试
test('test name', async ({ terminal }) => {
  // test body
}, { record: true, timeout: 30000 });

// 测试套件
describe('suite name', () => {
  test('test 1', async ({ terminal }) => { /* ... */ });
  test('test 2', async ({ terminal }) => { /* ... */ });
}, { record: true });

// 测试步骤
test('multi-step test', async ({ terminal }) => {
  await test.step('step 1', async () => {
    // step body
  });
  
  await test.step('step 2', async () => {
    // step body
  });
});
```

## 终端 API

```typescript
// 基础命令执行
const result = await terminal.run('echo hello');
// result: { exitCode, stdout, stderr, output, duration }

// 带选项的执行
const result = await terminal.run('command', {
  timeout: 10000,      // 超时时间（毫秒）
  silent: true,        // 静默模式，不录制
  cwd: '/path/to/dir', // 工作目录
});

// 交互式命令
const pty = await terminal.run('interactive-command', { interactive: true });
await pty.expect('prompt');      // 等待输出
await pty.send('input\n');       // 发送输入
await pty.sendRaw('\x03');       // 发送原始字符（如 Ctrl+C）
await pty.interrupt();           // 发送中断信号
await pty.finally();             // 等待完成

// 等待文本出现
await terminal.waitForText('expected text', {
  timeout: 5000,
  stripAnsi: true,  // 默认为 true
});

// 获取终端快照
const content = await terminal.snapshot();

// 多终端（录制模式）
const terminal2 = await terminal.create();
await terminal.selectPane(0);  // 切换 pane
```

## 断言 API

### 命令结果断言

```typescript
const result = await terminal.run('command');

// 退出码断言
await expect(result).toSucceed();           // exitCode === 0
await expect(result).toFail();              // exitCode !== 0
await expect(result).toHaveExitCode(0);     // 精确匹配

// 输出断言
await expect(result).toContainInOutput('text');           // stdout + stderr
await expect(result).toHaveStdout('exact stdout');        // 精确匹配
await expect(result).toHaveStderr('exact stderr');        // 精确匹配
await expect(result).toContainInStdout('text');           // 包含
await expect(result).toContainInStderr('text');           // 包含
await expect(result).toMatchStdout(/pattern/);            // 正则匹配
await expect(result).toMatchStderr(/pattern/);            // 正则匹配

// 否定断言
await expect(result).not.toSucceed();
await expect(result).not.toContainInOutput('error');
```

### 终端断言

```typescript
// 文本断言
await expect(terminal).toContainText('text');
await expect(terminal).toMatchPattern(/pattern/);

// 否定断言
await expect(terminal).not.toContainText('error');
```

## Hooks（生命周期钩子）

```typescript
describe('suite with hooks', () => {
  // 每个测试前后执行
  beforeEach(async ({ terminal }) => {
    // setup
  });
  
  afterEach(async ({ terminal }) => {
    // cleanup
  });
  
  // 命名 fixture（懒加载，仅在测试请求时执行）
  beforeEach('tmpDir', async () => {
    const dir = `/tmp/test-${Date.now()}`;
    await Bun.$`mkdir -p ${dir}`;
    return dir;  // 返回值可在测试中使用
  });
  
  afterEach('tmpDir', async (tmpDir) => {
    await Bun.$`rm -rf ${tmpDir}`;
  });
  
  // 全套件级别（洋葱模型）
  beforeAll(async () => {
    return { sharedResource: 'value' };  // 注入到 context
  });
  
  afterAll(async (context) => {
    // cleanup sharedResource
  });
  
  test('uses fixture', async ({ terminal, tmpDir }) => {
    // tmpDir 可用
  });
});
```

## 插件 API

```typescript
import { definePlugin, PluginRuntime, createTestWithPlugins } from 'repterm';

// 定义插件
const myPlugin = definePlugin({
  name: 'my-plugin',
  setup(ctx) {
    return {
      methods: {
        myMethod: async () => { /* ... */ }
      },
      context: {
        myValue: 'initial'
      },
      hooks: {
        beforeTest: async () => { /* ... */ },
        afterTest: async () => { /* ... */ }
      }
    };
  }
});

// 使用插件
const runtime = new PluginRuntime({
  plugins: [myPlugin()] as const,
});

const test = createTestWithPlugins(runtime);

test('with plugin', async (ctx) => {
  await ctx.plugins.myPlugin.myMethod();
  console.log(ctx.plugins.myPlugin.myValue);
});
```

## Kubectl 插件速查

```typescript
import { kubectlPlugin, pod, deployment } from '@repterm/plugin-kubectl';

// 配置
const runtime = new PluginRuntime({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

// 使用
test('k8s test', async (ctx) => {
  const k = ctx.plugins.kubectl;
  
  // 资源操作
  await k.apply('manifest.yaml');
  await k.delete('pod', 'my-pod');
  const pods = await k.get<Pod>('pods');
  const exists = await k.exists('pod', 'my-pod');
  
  // 等待
  await k.waitForPod('my-pod', 'Running', 60000);
  await k.wait('pod', 'my-pod', 'condition=Ready');
  
  // Rollout
  await k.rollout.status('deployment', 'my-deploy');
  await k.rollout.restart('deployment', 'my-deploy');
  
  // 断言
  await expect(pod(k, 'my-pod')).toBeRunning();
  await expect(deployment(k, 'my-deploy')).toHaveAvailableReplicas(3);
});
```

## See Also

- [examples-catalog.md](examples-catalog.md) - 完整示例索引
- [common-patterns.md](common-patterns.md) - 常见代码模式
- [troubleshooting.md](troubleshooting.md) - 问题排查指南
