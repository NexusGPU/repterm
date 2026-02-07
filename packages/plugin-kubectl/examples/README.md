# Kubectl Plugin Examples

Comprehensive examples for testing Kubernetes resources using `@nexusgpu/repterm-plugin-kubectl`.

---

## Prerequisites

Before running these examples, ensure you have a local Kubernetes cluster running:

1. **Local Cluster**:
   - [Docker Desktop](https://www.docker.com/products/docker-desktop) (Enable Kubernetes in settings)
   - [Minikube](https://minikube.sigs.k8s.io/) (`minikube start`)
   - [Kind](https://kind.sigs.k8s.io/) (`kind create cluster`)

2. **Verify Connection**:
   ```bash
   kubectl cluster-info
   ```

3. **Install Plugin**:
   Ensure `@nexusgpu/repterm-plugin-kubectl` is installed in your project.

## Usage

```bash
# Run simple demo (No K8s needed)
npx repterm packages/plugin-kubectl/examples/00-simple-demo.ts

# Run basic K8s tests
npx repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
```

---

## API & Scenarios

We organize the API by usage scenarios to help you find what you need quickly.

### 1. Observing

Inspect the state of your cluster.

- **Get Resources**:
  ```typescript
  const pods = await kubectl.get('pods');
  const myPod = await kubectl.get('pod', 'my-app-123');
  ```
- **Read Logs**:
  ```typescript
  await kubectl.logs('my-pod');
  await kubectl.logs('my-pod', { tail: 20 });
  ```
- **Describe**:
  ```typescript
  await kubectl.describe('pod', 'my-pod');
  ```
- **Check Events**:
  ```typescript
  await kubectl.getEvents({ fieldSelector: 'type=Warning' });
  ```

### 2. Acting

Modify resources or interact with them.

- **Apply/Delete**:
  ```typescript
  await kubectl.apply('apiVersion: v1...');
  await kubectl.delete('pod', 'my-pod');
  ```
- **Scale**:
  ```typescript
  await kubectl.scale('deployment', 'my-app', 5);
  ```
- **Exec**:
  ```typescript
  await kubectl.exec('my-pod', 'ls -la /app');
  ```
- **Port Forward**:
  ```typescript
  const handle = await kubectl.portForward('svc/my-app', '8080:80');
  // ... Do requests ...
  await handle.stop();
  ```

### 3. Asserting

Verify resource states using fluent matchers.

**Setup**:
```typescript
import { pod, deployment, registerK8sMatchers } from '@nexusgpu/repterm-plugin-kubectl';
registerK8sMatchers();
```

**Common Assertions**:
```typescript
// Existence
await expect(pod(kubectl, 'my-pod')).toExistInCluster();

// Status
await expect(pod(kubectl, 'my-pod')).toBeRunning();
await expect(deployment(kubectl, 'my-app')).toBeAvailable();

// Metadata
await expect(pod(kubectl, 'my-pod')).toHaveLabel('app', 'demo');
```

---

## Example Files

| File | Description | Needs K8s |
|:---|:---|:---:|
| `00-simple-demo.ts` | Plugin basics check | No |
| `01-basic-kubectl.ts` | CRUD operations | **Yes** |
| `02-debugging.ts` | Debugging: logs, exec, describe | **Yes** |
| `03-resource-management.ts` | Scaling, patching, labels | **Yes** |
| `04-rollout.ts` | Rollout strategies management | **Yes** |
| `05-matchers.ts` | **Fluent Matchers demo** | **Yes** |
| `06-advanced.ts` | Port-forward, events, cp | **Yes** |

## Troubleshooting

- **Error: connection refused**:
  - Check if your local cluster is running (`docker ps`, `minikube status`).
- **Timeout errors**:
  - Initial pull of images might take time. Increase timeout in tests or pre-pull images.
