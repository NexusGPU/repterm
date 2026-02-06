# @repterm/plugin-kubectl 指南

## 1. 快速定位

- 核心实现：`packages/plugin-kubectl/src/index.ts`
- Matcher：`packages/plugin-kubectl/src/matchers.ts`
- 类型补充：`packages/plugin-kubectl/src/matchers.d.ts`
- 示例：`packages/plugin-kubectl/examples/*.ts`

## 2. 正确的装配方式

```ts
import { defineConfig, createTestWithPlugins } from 'repterm';
import { kubectlPlugin } from '@repterm/plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);
```

> 不再推荐使用旧的 runtime 手工构造示例；外部使用统一走 `defineConfig(...)`。

## 3. 插件结构（源码对齐）

`kubectlPlugin(options)` 返回 `definePlugin('kubectl', setup)` 的结果，`setup` 输出三部分：

1. `methods`：挂到 `ctx.plugins.kubectl`。
2. `context`：挂到 `ctx.kubectl`（当前 namespace / kubeconfig）。
3. `hooks`：当前主要用于 before/after test 的调试提示。

## 4. 主要 API

### 4.1 基础执行与读取

- `run(args)`：执行 `kubectl ...` 并返回输出文本。
- `command(args)`：只生成命令字符串。
- `get(resource, name?, options?)`：
  - 默认返回 JSON 解析结果。
  - `options.jqFilter` 支持追加 `| jq '...'`。
  - `options.watch: true` 返回 `WatchProcess`（包含 `interrupt()`）。
- `getJsonPath(resource, name, jsonPath, options?)`
- `exists(resource, name)`
- `clusterInfo()`

### 4.2 资源生命周期

- `apply(yaml)`
- `delete(resource, name, { force? })`
- `waitForPod(name, status?, timeout?)`
- `wait(resource, name, condition, { timeout?, forDelete? })`
- `waitForJsonPath(resource, name, jsonPath, value, timeout?)`
- `waitForReplicas(resource, name, count, timeout?)`
- `waitForService(name, timeout?)`

### 4.3 管理与运维能力

- `logs(pod, options?)`
- `exec(pod, command, options?)`
- `describe(resource, name?)`
- `scale(resource, name, replicas)`
- `patch(resource, name, patch, type?)`
- `label(resource, name, labels)`
- `annotate(resource, name, annotations)`
- `rollout.status/history/undo/restart/pause/resume`
- `portForward(resource, ports, options?)`（返回 `stop()`）
- `getEvents(options?)`
- `getNodes(options?)`
- `cp(source, dest, options?)`

## 5. Watch 与 PTY 模式注意事项

1. `get(..., { watch: true })` 返回持续进程控制器，必须 `await watch.interrupt()` 主动收尾。
2. 录制或 PTY 模式下，插件内部会在 JSON 解析路径优先走 `silent` 二次执行获取干净 stdout。
3. 断言退出码时，优先在非 PTY/silent 结果上判断，避免 `code === -1` 干扰。

## 6. Matcher 与资源包装器

`matchers.ts` 会注册以下 matcher（核心新增项已包含）：

- `toBeSuccessful`
- `toExistInCluster`
- `toNotExistInCluster`
- `toBeRunning`
- `toHavePhase`
- `toHaveReplicas`
- `toHaveReadyReplicas`
- `toHaveAvailableReplicas`
- `toBeAvailable`
- `toHaveLabel`
- `toHaveAnnotation`
- `toHaveCondition`
- `toHaveStatusField`

可用资源包装器：

- 标准资源：`pod` / `deployment` / `service` / `statefulset` / `job` / `configmap` / `secret` / `resource` / `crd`
- CRD 辅助：`gpupool` / `gpu` / `tensorfusionworkload` / `tensorfusionconnection`

> 按你的要求，这里只保留 CRD 辅助入口说明，不新增 Tensor Fusion 专章。

## 7. 示例模板

```ts
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@repterm/plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

test('deploy and verify', async (ctx) => {
  const k = ctx.plugins.kubectl;

  await k.apply(manifestYaml);
  await k.waitForPod('demo', 'Running', 60_000);

  await expect(pod(k, 'demo')).toBeRunning();
  await expect(deployment(k, 'demo')).toHaveReadyReplicas(2);

  const watch = await k.get('pods', undefined, { watch: true, output: 'wide' });
  await watch.interrupt();
});
```

## 8. 示例运行命令

```bash
# 无集群可跑
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts

# 需集群
bun run repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
bun run repterm packages/plugin-kubectl/examples/05-matchers.ts
```

## See Also

- [api-cheatsheet.md](api-cheatsheet.md)
- [common-patterns.md](common-patterns.md)
- [troubleshooting.md](troubleshooting.md)
