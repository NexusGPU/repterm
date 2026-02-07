# Kubectl Plugin Examples

Comprehensive examples for testing Kubernetes resources using `@nexusgpu/repterm-plugin-kubectl`.

---

## Workspace setup (simulates user-side TS tests)

This folder is a Bun workspace package (`@nexusgpu/repterm-plugin-kubectl-examples`) and imports packages by name:

- `repterm`
- `repterm-api`
- `@nexusgpu/repterm-plugin-kubectl`

No path-based imports are required.

```bash
# from repo root
bun install --frozen-lockfile

# type-check all examples as user-style TS test cases
bun run --filter @nexusgpu/repterm-plugin-kubectl-examples check
```

## Prerequisites

Before running Kubernetes-dependent examples, ensure you have a local Kubernetes cluster running:

1. **Local Cluster**:
   - [Docker Desktop](https://www.docker.com/products/docker-desktop) (Enable Kubernetes in settings)
   - [Minikube](https://minikube.sigs.k8s.io/) (`minikube start`)
   - [Kind](https://kind.sigs.k8s.io/) (`kind create cluster`)

2. **Verify Connection**:
   ```bash
   kubectl cluster-info
   ```

## Usage

```bash
# from repo root: run examples package scripts
bun run --filter @nexusgpu/repterm-plugin-kubectl-examples run:simple
bun run --filter @nexusgpu/repterm-plugin-kubectl-examples run:basic

# or run a specific file directly
bunx repterm packages/plugin-kubectl/examples/00-simple-demo.ts
bunx repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
```

---

## API & Scenarios

### 1. Observing

Inspect the state of your cluster.

```typescript
const pods = await kubectl.get('pods');
const myPod = await kubectl.get('pod', 'my-app-123');
await kubectl.logs('my-pod', { tail: 20 });
await kubectl.describe('pod', 'my-pod');
await kubectl.getEvents({ fieldSelector: 'type=Warning' });
```

### 2. Acting

Modify resources or interact with them.

```typescript
await kubectl.apply('apiVersion: v1...');
await kubectl.delete('pod', 'my-pod');
await kubectl.scale('deployment', 'my-app', 5);
await kubectl.exec('my-pod', 'ls -la /app');
const handle = await kubectl.portForward('svc/my-app', '8080:80');
await handle.stop();
```

### 3. Asserting

Verify resource states using fluent matchers.

```typescript
import { pod, deployment, registerK8sMatchers } from '@nexusgpu/repterm-plugin-kubectl';
registerK8sMatchers();

await expect(pod(kubectl, 'my-pod')).toExistInCluster();
await expect(pod(kubectl, 'my-pod')).toBeRunning();
await expect(deployment(kubectl, 'my-app')).toBeAvailable();
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
| `05-matchers.ts` | Fluent matchers demo | **Yes** |
| `06-advanced.ts` | Port-forward, events, cp | **Yes** |

## Troubleshooting

- **Error: connection refused**
  - Check if your local cluster is running (`docker ps`, `minikube status`).
- **Timeout errors**
  - Initial image pull may take time. Increase timeout or pre-pull images.
