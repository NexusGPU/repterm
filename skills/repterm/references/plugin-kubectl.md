# @repterm/plugin-kubectl 指南

## 1. 目录结构
```
packages/plugin-kubectl/
├── src/
│   ├── index.ts        # 插件定义、kubectl 方法、上下文
│   ├── matchers.ts     # expect 扩展（pod/deployment 等）
│   └── matchers.d.ts   # 类型声明
├── examples/           # 00-06 示例
├── README.md           # API 说明与运行命令
└── package.json        # Bun/TypeScript 构建脚本
```

## 2. 插件定义要点（`src/index.ts`）
1. `definePlugin` 输出：
   ```ts
   export const kubectlPlugin = definePlugin({
     name: 'kubectl',
     setup(ctx: BasePluginContext) {
       return {
         methods: { kubectl: { run, apply, delete, ... } },
         context: { kubectl: { namespace, kubeconfig } },
         hooks: { beforeTest, afterTest, beforeCommand, afterOutput }
       };
     }
   });
   ```
2. 提供的主要方法：
   - `run(args)` / `command(args)`：直接执行或仅生成带 namespace 的命令字符串。
   - 资源操作：`apply`, `delete`, `get<T>`, `exists`, `waitForPod`, `wait`, `waitForReplicas`。
   - Rollout 管理：`rollout.status/history/undo/restart/pause/resume`.
   - 端口转发：`portForward('svc/foo', '8080:80', opts)`，返回带 `stop()` 的句柄。
   - 事件/节点：`getEvents`, `getNodes`.
   - 复制文件：`cp('pod:/path', '/local')`.
3. Options 接口（`LogsOptions`, `ExecOptions`, `WaitOptions`, `PortForwardOptions`, `DeleteOptions` 等）位于同文件顶部，可在新插件中参考命名方式。

## 3. Matcher 扩展（`src/matchers.ts`）
1. `K8sResource` 包装 `{ kubectl, kind, name }`。提供 `pod()`、`deployment()`、`service()`、`statefulset()`、`job()`、`configmap()`、`secret()`、`resource()`。
2. `registerK8sMatchers()` 调用 `expect.extend`，注册以下 matcher：
   - `toExistInCluster`
   - `toBeRunning(timeout?)`
   - `toHavePhase(phase)`
   - `toHaveReplicas(count)`
   - `toHaveAvailableReplicas(count)`
   - `toBeAvailable()`
   - `toHaveLabel(key, value?)`
   - `toHaveAnnotation(key, value?)`
   - `toHaveCondition(type, status)`
3. 所有 matcher 都检查 `received instanceof K8sResource`，失败信息清晰，可直接用于 CLI 输出。

## 4. 示例脚本（`examples/README.md`）
| 文件 | 内容 | 依赖 |
| --- | --- | --- |
| `00-simple-demo.ts` | 验证插件装配，无需真实集群 | Bun |
| `01-basic-kubectl.ts` | apply/delete/get/exists/waitForPod | 连接到 K8s |
| `02-debugging.ts` | logs/exec/describe | K8s |
| `03-resource-management.ts` | scale/patch/label/annotate/wait | K8s |
| `04-rollout.ts` | rollout.status/history/undo | K8s |
| `05-matchers.ts` | 所有 expect matcher 的示例 | K8s |
| `06-advanced.ts` | portForward/getEvents/getNodes/cp | K8s |

运行方式（在 repo 根）：
```bash
# 无需 K8s 的演示
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts

# 需 K8s 的示例
KUBECONFIG=~/.kube/config bun run repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
```

## 5. 在测试中使用插件
1. 定义配置：
   ```ts
   import { defineConfig } from 'repterm';
   import { kubectlPlugin } from '@repterm/plugin-kubectl';

   const runtime = new PluginRuntime({
     plugins: [kubectlPlugin({ namespace: 'default' })] as const,
   });
   const test = createTestWithPlugins(runtime);
   ```
2. 在测试里：
   ```ts
   test('pod ready', async (ctx) => {
     await ctx.plugins.kubectl.apply(manifest);
     await ctx.plugins.kubectl.waitForPod('demo', 'Running', 60000);
     await expect(pod(ctx.plugins.kubectl, 'demo')).toBeRunning();
   });
   ```
3. 结合 `describeWithPlugins` 批量共享 runtime。

## 6. 扩展/自定义
- 若要新增企业内插件，可复制 `packages/plugin-kubectl` 结构：  
  - 定义 context/methods，必要时在 `PluginHooks` 中拦截 before/afterCommand。  
  - 提供 `matchers.ts` 扩展 `expect` 并导出 `registerXxxMatchers()`。  
  - 添加示例与 README，方便文档引用。  
- 更新技能时，将新插件加入本文件或独立参考文档。

---

## See Also

- [api-cheatsheet.md](api-cheatsheet.md) - API 速查表（含 Kubectl 速查）
- [common-patterns.md](common-patterns.md) - 常见代码模式
- [architecture.md](architecture.md) - 插件系统架构
