# Repterm 示例

本目录包含 Repterm 测试框架的使用示例。

## 运行示例

```bash
cd packages/repterm

# 运行单个示例
bun src/cli/index.ts examples/01-basic-commands.ts

# 运行多个示例（注意：04-fixtures 建议单独运行，因为 hooks 是全局的）
bun src/cli/index.ts examples/01-basic-commands.ts examples/02-command-assertions.ts

# 启用录制模式
bun src/cli/index.ts --record examples/01-basic-commands.ts
```

## 示例列表

| 文件 | 内容 | 测试数 |
|------|------|--------|
| `01-basic-commands.ts` | 基础命令执行、CommandResult 新字段 | 4 |
| `02-command-assertions.ts` | 链式断言、否定断言、正则匹配 | 5 |
| `03-interactive-commands.ts` | PTYProcess 控制器、PromiseLike 特性 | 3 |
| `04-fixtures-with-hooks.ts` | beforeEach 返回值注入、fixtures | 2 |
| `05-multi-terminal.ts` | 多终端创建、进程间通信 | 2 |
| `06-terminal-assertions.ts` | Terminal 断言、snapshot | 4 |
| `07-test-organization.ts` | describe/test/step 组织结构 | 5 |

**总计：25 个测试**

## 关键用法

### 基础用法
```typescript
import { test, expect } from '../src/index.js';

test('简单命令', async ({ terminal }) => {
  const result = await terminal.run('echo "Hello"');
  expect(result).toSucceed().toHaveStdout('Hello');
});
```

### 交互式命令
```typescript
test('交互式', async ({ terminal }) => {
  const proc = terminal.run('echo "step 1"; sleep 0.1; echo "step 2"');
  await proc.expect('step 1');
  const result = await proc;
  expect(result).toSucceed();
});
```

### Fixtures（beforeEach 返回值注入）
```typescript
import { beforeEach, afterEach } from '../src/index.js';

beforeEach(async () => {
  const tmpDir = await fs.mkdtemp('/tmp/test-');
  return { tmpDir };  // 自动注入到 context
});

afterEach(async ({ tmpDir }) => {
  await fs.rm(tmpDir, { recursive: true });
});

test('使用 fixture', async ({ terminal, tmpDir }) => {
  await terminal.run(`touch ${tmpDir}/test.txt`);
});
```

### 链式断言
```typescript
expect(result)
  .toSucceed()
  .toHaveStdout('hello')
  .not.toContainInOutput('error');
```
