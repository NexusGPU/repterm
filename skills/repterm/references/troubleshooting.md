# 问题排查指南

> 本文档汇总 Repterm 常见问题及解决方案，按症状分类便于快速定位。

## 症状 → 解决方案速查表

| 症状 | 可能原因 | 解决方案 |
|------|----------|----------|
| 依赖缺失报错 | asciinema/tmux 未安装 | `brew install asciinema tmux` (macOS) 或 `apt-get install asciinema tmux` (Ubuntu) |
| 录制卡死 | tmux session 未正确关闭 | 检查 `Terminal.close()` 调用；手动执行 `tmux kill-server` |
| 测试加载不到 | 文件 pattern 不匹配 | 检查 `LoaderOptions.pattern`，默认匹配 `.ts/.js` |
| 并行调度失败 | suite 不可序列化 | 不要在 suite 对象中保留不可克隆资源（如函数、Socket）|
| Reporter 输出错乱 | stdout 被意外插入 | 确保 `onTestStart` 调用前不要打印额外内容 |
| `waitForText` 超时 | 文本未出现或 ANSI 码干扰 | 调整 `timeout`；检查 `stripAnsi` 选项 |
| exitCode 返回 -1 | 录制模式下 PTY 限制 | 这是正常行为，录制模式下 exitCode 不可靠 |
| Kubectl 插件测试失败 | 无 K8s 集群连接 | 设置 `KUBECONFIG` 环境变量，或使用 `00-simple-demo.ts` 验证 |

---

## 1. 依赖相关问题

### 1.1 依赖缺失报错

**症状**：运行 `--record` 模式时提示 `asciinema not found` 或 `tmux not found`

**原因**：录制模式依赖 asciinema 和 tmux

**解决方案**：
```bash
# macOS
brew install asciinema tmux

# Ubuntu/Debian
apt-get install asciinema tmux
```

**相关代码**：`packages/repterm/src/utils/dependencies.ts` 的 `checkDependencies()`

### 1.2 CI 环境无法安装依赖

**症状**：CI 中无法或不想安装 asciinema/tmux

**解决方案**：
1. 跳过录制测试：不使用 `--record` 参数
2. 过滤 `{ record: true }` 的测试
3. 在 CI 配置中安装依赖

---

## 2. 终端与录制问题

### 2.1 录制卡死/无响应

**症状**：测试一直挂起，不退出

**可能原因**：
- tmux session 未正确关闭
- asciinema 进程未终止

**调试步骤**：
```bash
# 检查 tmux session
tmux list-sessions

# 强制清理
tmux kill-server

# 检查 asciinema 进程
ps aux | grep asciinema
kill -9 <pid>
```

**代码层面**：检查 `Terminal.close()` 是否被调用，该方法会执行：
1. 等待 2 秒
2. 发送 `Ctrl+B d` detach
3. 发送 SIGTERM
4. 执行 `tmux kill-session`

### 2.2 `waitForText` 超时

**症状**：`terminal.waitForText('text')` 抛出超时错误

**调试技巧**：
```typescript
// 使用 snapshot 查看当前终端内容
const content = await terminal.snapshot();
console.log('Current terminal content:', content);

// 增加超时时间
await terminal.waitForText('text', { timeout: 10000 });

// 禁用 ANSI 码剥离（如果需要匹配原始输出）
await terminal.waitForText('text', { stripAnsi: false });
```

**常见原因**：
- 超时时间太短
- ANSI 转义码干扰匹配
- 输出在不同的 pane 中

### 2.3 多 pane 内容错乱

**症状**：多终端测试中，输出混淆

**解决方案**：
- 不要在 shell 内手动切换 tmux pane
- 使用 `terminal.selectPane(index)` 切换
- 每个 pane 的输出独立存储在 `SharedTerminalState.paneOutputs`

### 2.4 exitCode 返回 -1

**症状**：录制模式下 `result.exitCode` 总是 -1

**原因**：这是 PTY 的固有限制，录制模式下 exitCode 不可靠

**解决方案**：
- 非录制模式测试中直接断言 exitCode
- 录制模式中使用 `silent` 选项执行需要可靠 exitCode 的命令：
  ```typescript
  const result = await terminal.run('command', { silent: true });
  // silent 模式强制使用 Bun.spawn，即使在录制模式下
  ```

---

## 3. 测试执行问题

### 3.1 测试加载不到

**症状**：CLI 显示 0 个测试被发现

**检查项**：
1. 文件扩展名是否为 `.ts` 或 `.js`
2. 是否使用了 `test()` 或 `describe()` 注册测试
3. 路径是否正确

**自定义 pattern**：
```typescript
import { discoverTests } from 'repterm';

const suites = await discoverTests(testDir, {
  pattern: '**/*.spec.ts',  // 自定义 glob
});
```

**相关测试**：`packages/repterm/tests/unit/loader.test.ts`

### 3.2 并行调度失败

**症状**：使用 `--workers` 时出错

**检查项**：
1. workers 数量 >= 2
2. suite 对象可序列化

**不可序列化的对象示例**：
```typescript
// ❌ 错误：函数不可序列化
describe('bad', () => {
  const handler = () => {};  // 会导致序列化失败
});

// ✅ 正确：只保留可序列化数据
describe('good', () => {
  const config = { timeout: 5000 };  // OK
});
```

### 3.3 Reporter 输出错乱

**症状**：suite 标题显示不正确，输出混乱

**原因**：在 `onTestStart` 之前插入了额外的 stdout

**解决方案**：
- 移除测试代码中的 `console.log` 调试语句
- 使用 `--verbose` 参数查看详细堆栈

---

## 4. Hooks 相关问题

### 4.1 Fixture 未执行

**症状**：`beforeEach('name')` 定义的 fixture 未运行

**原因**：测试函数参数中未请求该 fixture

**解决方案**：
```typescript
// ❌ fixture 不会执行
test('test', async ({ terminal }) => { ... });

// ✅ fixture 会执行
test('test', async ({ terminal, tmpDir }) => { ... });
```

### 4.2 beforeAll/afterAll 顺序错误

**原因**：hooks 使用洋葱模型（onion model）

**执行顺序**：
1. 父 suite beforeAll
2. 子 suite beforeAll
3. 测试执行
4. 子 suite afterAll
5. 父 suite afterAll

**参考测试**：`packages/repterm/tests/unit/runner-lifecycle.test.ts`

---

## 5. 插件问题

### 5.1 Kubectl 插件连接失败

**症状**：kubectl 命令返回连接错误

**解决方案**：
```bash
# 设置 kubeconfig
export KUBECONFIG=~/.kube/config

# 验证连接
kubectl cluster-info

# 使用无需集群的演示
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
```

### 5.2 自定义 Matcher 不生效

**症状**：`expect().toMyMatcher()` 报错

**检查项**：
1. 是否调用了 `registerXxxMatchers()`
2. 类型声明文件 `matchers.d.ts` 是否更新

**参考**：`packages/plugin-kubectl/src/matchers.ts`

---

## 6. 调试技巧总结

### 6.1 使用 snapshot 调试

```typescript
test('debug', async ({ terminal }) => {
  await terminal.run('some command');
  
  // 打印当前终端内容
  const content = await terminal.snapshot();
  console.log('Terminal content:', content);
});
```

### 6.2 使用 verbose 模式

```bash
bun src/cli/index.ts --verbose packages/repterm/examples/
```

### 6.3 检查生成的 artifacts

```bash
ls -la artifacts/<runId>/
# .cast 文件可用 asciinema play 播放
# .log 文件包含详细日志
```

### 6.4 手动重现问题

```bash
# 启动 tmux session
tmux new -s debug

# 在 session 中手动执行命令
# 检查输出是否符合预期
```

---

## See Also

- [terminal-modes.md](terminal-modes.md) - 终端执行模式详解
- [runner-pipeline.md](runner-pipeline.md) - Runner 执行流程
- [api-cheatsheet.md](api-cheatsheet.md) - API 速查表
