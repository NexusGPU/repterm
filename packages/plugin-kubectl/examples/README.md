# Kubectl Plugin Examples / Kubectl 插件示例

Comprehensive examples for testing Kubernetes resources using `@repterm/plugin-kubectl`.
使用 `@repterm/plugin-kubectl` 测试 Kubernetes 资源的综合示例。

---

## Prerequisites / 前提条件

Before running these examples, ensure you have a local Kubernetes cluster running:
在运行这些示例之前，请确保你有一个正在运行的本地 Kubernetes 集群：

1.  **Local Cluster / 本地集群**:
    - [Docker Desktop](https://www.docker.com/products/docker-desktop) (Enable Kubernetes in settings)
    - [Minikube](https://minikube.sigs.k8s.io/) (`minikube start`)
    - [Kind](https://kind.sigs.k8s.io/) (`kind create cluster`)

2.  **Verify Connection / 验证连接**:
    ```bash
    kubectl cluster-info
    ```

3.  **Install Plugin / 安装插件**:
    Ensure `@repterm/plugin-kubectl` is installed in your project.
    确保项目中已安装 `@repterm/plugin-kubectl`。

## Usage / 使用方法

```bash
# Run simple demo (No K8s needed) / 运行简单演示（无需 K8s）
npx repterm packages/plugin-kubectl/examples/00-simple-demo.ts

# Run basic K8s tests / 运行基础 K8s 测试
npx repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
```

---

## API & Scenarios / API 与场景

We organize the API by usage scenarios to help you find what you need quickly.
我们将 API 按使用场景分类，帮助你快速找到所需内容。

### 1. Observing / 观察

Inspect the state of your cluster. / 检查集群状态。

- **Get Resources**:
  ```typescript
  const pods = await kubectl.get('pods');
  const myPod = await kubectl.get('pod', 'my-app-123');
  ```
- **Read Logs / 读取日志**:
  ```typescript
  await kubectl.logs('my-pod');
  await kubectl.logs('my-pod', { tail: 20 });
  ```
- **Describe / 描述详情**:
  ```typescript
  await kubectl.describe('pod', 'my-pod');
  ```
- **Check Events / 查看事件**:
  ```typescript
  await kubectl.getEvents({ fieldSelector: 'type=Warning' });
  ```

### 2. Acting / 操作

Modify resources or interact with them. / 修改资源或与其交互。

- **Apply/Delete / 应用与删除**:
  ```typescript
  await kubectl.apply('apiVersion: v1...');
  await kubectl.delete('pod', 'my-pod');
  ```
- **Scale / 扩缩容**:
  ```typescript
  await kubectl.scale('deployment', 'my-app', 5);
  ```
- **Exec / 执行命令**:
  ```typescript
  await kubectl.exec('my-pod', 'ls -la /app');
  ```
- **Port Forward / 端口转发**:
  ```typescript
  const handle = await kubectl.portForward('svc/my-app', '8080:80');
  // ... Do requests ...
  await handle.stop();
  ```

### 3. Asserting / 验证

Verify resource states using fluent matchers. / 使用流畅的匹配器验证资源状态。

**Setup / 设置**:
```typescript
import { pod, deployment, registerK8sMatchers } from '@repterm/plugin-kubectl';
registerK8sMatchers();
```

**Common Assertions / 常用断言**:
```typescript
// Existence / 存在性
await expect(pod(kubectl, 'my-pod')).toExistInCluster();

// Status / 状态
await expect(pod(kubectl, 'my-pod')).toBeRunning();
await expect(deployment(kubectl, 'my-app')).toBeAvailable();

// Metadata / 元数据
await expect(pod(kubectl, 'my-pod')).toHaveLabel('app', 'demo');
```

---

## Example Files / 示例文件列表

| File / 文件 | Description / 说明 | Needs K8s / 需 K8s |
|:---|:---|:---:|
| `00-simple-demo.ts` | Plugin basics check / 插件基础功能检查 | No / 否 |
| `01-basic-kubectl.ts` | CRUD operations / 增删改查操作 | **Yes** |
| `02-debugging.ts` | Debugging: logs, exec, describe / 调试功能 | **Yes** |
| `03-resource-management.ts` | Scaling, patching, labels / 资源管理 | **Yes** |
| `04-rollout.ts` | Rollout strategies / 发布策略管理 | **Yes** |
| `05-matchers.ts` | **Fluent Matchers demo / 流畅匹配器演示** | **Yes** |
| `06-advanced.ts` | Port-forward, events, cp / 高级功能 | **Yes** |

## Troubleshooting / 故障排除

- **Error: connection refused**: 
  - Check if your local cluster is running (`docker ps`, `minikube status`).
  - 检查本地集群是否运行中。
- **Timeout errors**:
  - Initial pull of images might take time. Increase timeout in tests or pre-pull images.
  - 首次拉取镜像可能较慢。请在测试中增加超时时间或预先拉取镜像。
