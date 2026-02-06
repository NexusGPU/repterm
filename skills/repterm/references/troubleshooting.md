# 问题排查指南

## 1. 症状速查

| 症状 | 可能原因 | 优先处理 |
| --- | --- | --- |
| `--record` 启动失败 | 缺少 `asciinema`/`tmux` | 安装依赖并重试 |
| `code === -1` | 当前走 PTY/录制路径 | 改断言输出或使用 `silent` |
| `waitForText` 超时 | 文本未出现/ANSI 干扰/超时太短 | 拉长 timeout，必要时 `stripAnsi: false` |
| 0 tests found | 路径错误或过滤后为空 | 检查输入路径与 `{ record: true }` 标记 |
| Kubectl JSON 解析异常 | PTY 输出混杂 | 用插件内置 JSON API 或 `silent` 路径 |

## 2. 录制相关

### 2.1 依赖缺失

```bash
# macOS
brew install asciinema tmux

# Ubuntu / Debian
apt-get install asciinema tmux
```

对应检测：`packages/repterm/src/utils/dependencies.ts`。

### 2.2 录制卡住

```bash
tmux list-sessions
tmux kill-server
ps aux | grep asciinema
```

代码清理路径在 `Terminal.close()`：detach → kill process → kill tmux session。

### 2.3 为什么没有 `.cast`

确认同时满足：

1. CLI 带 `--record`
2. 测试或 suite 标记 `{ record: true }`

否则 `{ record: true }` 测试只会进入 PTY-only，不会落 `.cast`。

## 3. 退出码与输出断言

PTY/录制路径下 `CommandResult.code` 可能是 `-1`。建议：

```ts
const result = await terminal.run('kubectl get pod x -o json', { silent: true });
await expect(result).toHaveExitCode(0);
```

或直接断言输出：

```ts
await expect(result).toContainInOutput('Running');
```

## 4. `waitForText` 失败

```ts
const snapshot = await terminal.snapshot();
console.log(snapshot);

await terminal.waitForText('expected', { timeout: 10_000, stripAnsi: true });
```

如果要匹配带颜色控制字符的原始输出，设置 `stripAnsi: false`。

## 5. 测试发现与过滤

### 5.1 路径与扩展名

- 默认匹配 `.ts/.js`。
- 直接文件路径可执行。

### 5.2 自定义 pattern（`RegExp`）

```ts
import { discoverTests } from '../packages/repterm/src/runner/loader.js';

const files = await discoverTests(['packages/repterm/examples'], {
  pattern: /\.spec\.ts$/,
});
```

> `discoverTests` 的 `pattern` 类型是 `RegExp`，不是 glob 字符串。

## 6. Kubectl 插件常见问题

### 6.1 集群连接失败

```bash
export KUBECONFIG=~/.kube/config
kubectl cluster-info
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
```

### 6.2 Watch 不退出

```ts
const watch = await ctx.plugins.kubectl.get('pods', undefined, { watch: true });
await watch.interrupt();
```

Watch 必须显式中断，否则测试可能挂起。

## 7. 最小复现命令

```bash
# 单元测试
bun test packages/repterm/tests/unit

# 核心示例
bun run repterm packages/repterm/examples/01-basic-commands.ts

# 录制示例
bun run repterm --record packages/repterm/examples/08-recording-demos.ts
```

## See Also

- [terminal-modes.md](terminal-modes.md)
- [runner-pipeline.md](runner-pipeline.md)
- [api-cheatsheet.md](api-cheatsheet.md)
