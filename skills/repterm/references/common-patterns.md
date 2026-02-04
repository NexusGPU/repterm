# 常见代码模式

> 本文档提供 Repterm 常见使用场景的代码模板，可直接复制使用。

## 1. 基础测试模板

### 1.1 最简单的测试

```typescript
import { test, expect } from 'repterm';

test('basic command test', async ({ terminal }) => {
  const result = await terminal.run('echo "Hello, World!"');
  
  await expect(result).toSucceed();
  await expect(result).toContainInOutput('Hello, World!');
});
```

### 1.2 带 describe 的测试套件

```typescript
import { test, expect, describe } from 'repterm';

describe('My Feature', () => {
  test('should do something', async ({ terminal }) => {
    const result = await terminal.run('some-command');
    await expect(result).toSucceed();
  });

  test('should handle errors', async ({ terminal }) => {
    const result = await terminal.run('failing-command');
    await expect(result).toFail();
    await expect(result).toContainInStderr('error');
  });
});
```

### 1.3 带录制的测试

```typescript
import { test, expect, describe } from 'repterm';

describe('Recording Demo', { record: true }, () => {
  test('demo command', async ({ terminal }) => {
    await terminal.run('ls -la');
    await terminal.waitForText('total');
  });
});

// 或者单个测试
test('single recording', async ({ terminal }) => {
  await terminal.run('pwd');
}, { record: true });
```

---

## 2. 交互式命令

### 2.1 基础交互

```typescript
import { test, expect } from 'repterm';

test('interactive command', async ({ terminal }) => {
  const pty = await terminal.run('python3', { interactive: true });
  
  await pty.expect('>>>');           // 等待 Python 提示符
  await pty.send('print("hi")\n');   // 发送输入
  await pty.expect('hi');            // 等待输出
  await pty.send('exit()\n');        // 退出
  await pty.finally();               // 等待完成
});
```

### 2.2 带超时的交互

```typescript
test('interactive with timeout', async ({ terminal }) => {
  const pty = await terminal.run('slow-interactive-command', {
    interactive: true,
    timeout: 30000,
  });
  
  try {
    await pty.expect('ready', { timeout: 10000 });
    await pty.send('input\n');
  } finally {
    await pty.interrupt();  // 确保清理
  }
});
```

### 2.3 处理确认提示

```typescript
test('confirmation prompt', async ({ terminal }) => {
  const pty = await terminal.run('dangerous-command', { interactive: true });
  
  await pty.expect('Are you sure? [y/N]');
  await pty.send('y\n');
  await pty.expect('Done');
  await pty.finally();
});
```

---

## 3. Fixtures 与 Hooks

### 3.1 命名 Fixture（懒加载）

```typescript
import { test, describe, beforeEach, afterEach } from 'repterm';

describe('With Fixtures', () => {
  // 定义 fixture（仅在测试请求时执行）
  beforeEach('tmpDir', async () => {
    const dir = `/tmp/test-${Date.now()}`;
    await Bun.$`mkdir -p ${dir}`;
    return dir;
  });

  afterEach('tmpDir', async (tmpDir: string) => {
    await Bun.$`rm -rf ${tmpDir}`;
  });

  // 使用 fixture（在参数中请求）
  test('uses tmpDir', async ({ terminal, tmpDir }) => {
    await terminal.run(`touch ${tmpDir}/test.txt`);
    const result = await terminal.run(`ls ${tmpDir}`);
    await expect(result).toContainInOutput('test.txt');
  });

  // 不使用 fixture（fixture 不会执行）
  test('no fixture needed', async ({ terminal }) => {
    await terminal.run('echo hello');
  });
});
```

### 3.2 beforeAll/afterAll（共享资源）

```typescript
import { test, describe, beforeAll, afterAll } from 'repterm';

describe('Shared Resources', () => {
  beforeAll(async () => {
    // 启动服务器
    const server = Bun.serve({
      port: 3000,
      fetch: () => new Response('OK'),
    });
    return { server, port: 3000 };
  });

  afterAll(async ({ server }) => {
    server.stop();
  });

  test('can reach server', async ({ terminal, port }) => {
    const result = await terminal.run(`curl http://localhost:${port}`);
    await expect(result).toContainInOutput('OK');
  });
});
```

### 3.3 嵌套 Suite 继承 Context

```typescript
describe('Parent', () => {
  beforeAll(async () => ({ parentValue: 'from parent' }));

  describe('Child', () => {
    beforeAll(async () => ({ childValue: 'from child' }));

    test('has both values', async ({ terminal, parentValue, childValue }) => {
      console.log(parentValue);  // 'from parent'
      console.log(childValue);   // 'from child'
    });
  });
});
```

---

## 4. 多终端测试

### 4.1 基础多终端

```typescript
import { test, describe } from 'repterm';

describe('Multi-Terminal', { record: true }, () => {
  test('two terminals communicate', async ({ terminal }) => {
    // 创建第二个终端
    const terminal2 = await terminal.create();

    // 在第一个终端写文件
    await terminal.run('echo "message" > /tmp/shared.txt');

    // 在第二个终端读文件
    const result = await terminal2.run('cat /tmp/shared.txt');
    await expect(result).toContainInOutput('message');
  });
});
```

### 4.2 服务器-客户端模式

```typescript
import { test, describe } from 'repterm';

describe('Server-Client', { record: true }, () => {
  test('client connects to server', async ({ terminal }) => {
    // 启动服务器（后台）
    const serverPty = await terminal.run('python3 -m http.server 8080', {
      interactive: true,
    });

    // 等待服务器就绪
    await terminal.waitForText('Serving HTTP');

    // 创建客户端终端
    const client = await terminal.create();
    
    // 发送请求
    const result = await client.run('curl http://localhost:8080');
    await expect(result).toContainInOutput('Directory listing');

    // 清理
    await serverPty.interrupt();
  });
});
```

---

## 5. 错误处理

### 5.1 预期失败

```typescript
import { test, expect } from 'repterm';

test('expects failure', async ({ terminal }) => {
  const result = await terminal.run('exit 1');
  
  await expect(result).toFail();
  await expect(result).toHaveExitCode(1);
});
```

### 5.2 捕获特定错误

```typescript
import { test, expect } from 'repterm';

test('handles error message', async ({ terminal }) => {
  const result = await terminal.run('cat nonexistent.txt');
  
  await expect(result).toFail();
  await expect(result).toContainInStderr('No such file');
});
```

### 5.3 Step 中的错误

```typescript
import { test } from 'repterm';

test('multi-step with potential failure', async ({ terminal }) => {
  await test.step('setup', async () => {
    await terminal.run('mkdir -p /tmp/test');
  });

  await test.step('operation that might fail', async () => {
    const result = await terminal.run('risky-command');
    // 如果这里失败，错误会记录到 step 中
  });

  await test.step('cleanup', async () => {
    await terminal.run('rm -rf /tmp/test');
  });
});
```

---

## 6. Kubectl 插件模式

### 6.1 基础 Pod 操作

```typescript
import { PluginRuntime, createTestWithPlugins } from 'repterm';
import { kubectlPlugin, pod } from '@repterm/plugin-kubectl';

const runtime = new PluginRuntime({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(runtime);

test('create and verify pod', async (ctx) => {
  const k = ctx.plugins.kubectl;

  // 创建 Pod
  await k.apply('manifests/nginx.yaml');

  // 等待 Running
  await k.waitForPod('nginx', 'Running', 60000);

  // 断言
  await expect(pod(k, 'nginx')).toBeRunning();

  // 清理
  await k.delete('pod', 'nginx');
});
```

### 6.2 Deployment 和 Rollout

```typescript
test('deployment rollout', async (ctx) => {
  const k = ctx.plugins.kubectl;

  await k.apply('manifests/deployment.yaml');
  await k.rollout.status('deployment', 'my-app');

  // 检查副本数
  await expect(deployment(k, 'my-app')).toHaveAvailableReplicas(3);

  // 重启
  await k.rollout.restart('deployment', 'my-app');
  await k.rollout.status('deployment', 'my-app');
});
```

### 6.3 Port Forward

```typescript
test('port forward', async (ctx) => {
  const k = ctx.plugins.kubectl;

  await k.apply('manifests/service.yaml');

  // 启动端口转发
  const pf = await k.portForward('svc/my-service', '8080:80');

  try {
    // 使用转发的端口
    const result = await ctx.terminal.run('curl http://localhost:8080');
    await expect(result).toContainInOutput('OK');
  } finally {
    // 停止转发
    await pf.stop();
  }
});
```

---

## 7. 调试模式

### 7.1 打印终端内容

```typescript
test('debug output', async ({ terminal }) => {
  const result = await terminal.run('complex-command');
  
  // 打印完整输出用于调试
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('exitCode:', result.exitCode);

  // 打印终端快照
  const snapshot = await terminal.snapshot();
  console.log('terminal:', snapshot);
});
```

### 7.2 增加超时

```typescript
test('slow operation', async ({ terminal }) => {
  const result = await terminal.run('slow-command', {
    timeout: 60000,  // 60 秒
  });
}, { timeout: 120000 });  // 测试整体 120 秒
```

---

## See Also

- [api-cheatsheet.md](api-cheatsheet.md) - API 速查表
- [examples-catalog.md](examples-catalog.md) - 完整示例索引
- [troubleshooting.md](troubleshooting.md) - 问题排查指南
