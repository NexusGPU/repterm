# @repterm/plugin-kubectl

Kubernetes testing plugin for Repterm. Provides kubectl operations and expect matchers for K8s resources.

## Installation

```bash
bun add @repterm/plugin-kubectl
```

## Quick Start

```typescript
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@repterm/plugin-kubectl';

const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

test('deploy nginx', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await kubectl.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
  - name: nginx
    image: nginx:alpine
`);

    await kubectl.waitForPod('nginx', 'Running');
    await expect(pod(kubectl, 'nginx')).toBeRunning();
});
```

## API Reference

### Plugin Options

```typescript
kubectlPlugin({
    namespace?: string;    // Default namespace (default: 'default')
    kubeconfig?: string;   // Path to kubeconfig file
})
```

### Core Methods

| Method | Description |
|--------|-------------|
| `run(args)` | Execute raw kubectl command |
| `command(args)` | Get kubectl command string with namespace |
| `apply(yaml)` | Create/update resource from YAML |
| `delete(resource, name, options?)` | Delete resource |
| `get<T>(resource, name?, options?)` | Get resource as JSON |
| `getJsonPath<T>(resource, name, jsonPath, options?)` | Get specific field via JSONPath |
| `exists(resource, name)` | Check if resource exists |
| `clusterInfo()` | Get cluster connection info |
| `setNamespace(ns)` | Set current namespace |
| `getNamespace()` | Get current namespace |

### Get Options

```typescript
interface GetOptions {
    selector?: string;       // Label selector (-l)
    fieldSelector?: string;  // Field selector
    allNamespaces?: boolean; // All namespaces (-A)
}

// Examples
await kubectl.get('pod', undefined, { selector: 'app=nginx' });
await kubectl.get('pod', undefined, { allNamespaces: true });
```

### JSONPath Query

```typescript
// Get specific field value
const phase = await kubectl.getJsonPath<string>('pod', 'nginx', '{.status.phase}');
const tflops = await kubectl.getJsonPath<number>('gpu', 'gpu-0', '{.status.available.tflops}');
```

### Cluster Info

```typescript
const info = await kubectl.clusterInfo();
// {
//   reachable: true,
//   controlPlane: 'https://...',
//   serverVersion: 'v1.28.0',
//   coreDNS: 'https://...'
// }
```

### Wait Methods

| Method | Description |
|--------|-------------|
| `waitForPod(name, status?, timeout?)` | Wait for pod status |
| `wait(resource, name, condition, options?)` | Wait for condition |
| `waitForJsonPath(resource, name, jsonPath, value, timeout?)` | Wait for field value |
| `waitForReplicas(resource, name, count, timeout?)` | Wait for replica count |
| `waitForService(name, timeout?)` | Wait for service endpoints |

```typescript
// Wait for pod running
await kubectl.waitForPod('nginx', 'Running', 60000);

// Wait for custom condition
await kubectl.wait('deployment', 'nginx', 'Available');

// Wait for JSONPath field value
await kubectl.waitForJsonPath('tensorfusionworkload', 'my-workload', '{.status.phase}', 'Running');
```

### Resource Management

| Method | Description |
|--------|-------------|
| `logs(pod, options?)` | Get pod logs |
| `exec(pod, command, options?)` | Execute command in pod |
| `describe(resource, name?)` | Get resource description |
| `scale(resource, name, replicas)` | Scale resource |
| `patch(resource, name, patch, type?)` | Patch resource |
| `label(resource, name, labels)` | Update labels |
| `annotate(resource, name, annotations)` | Update annotations |

### Rollout Management

```typescript
// Get rollout status
const status = await kubectl.rollout.status('deployment', 'nginx');

// Rollout operations
await kubectl.rollout.restart('deployment', 'nginx');
await kubectl.rollout.pause('deployment', 'nginx');
await kubectl.rollout.resume('deployment', 'nginx');
await kubectl.rollout.undo('deployment', 'nginx', revision?);
const history = await kubectl.rollout.history('deployment', 'nginx');
```

### Advanced Features

| Method | Description |
|--------|-------------|
| `portForward(resource, ports, options?)` | Port forward |
| `getEvents(options?)` | Get cluster events |
| `getNodes(options?)` | Get node info |
| `cp(source, dest, options?)` | Copy files to/from pod |

## Resource Wrappers

Create typed resource references for matchers:

```typescript
import {
    pod, deployment, service, statefulset, job, configmap, secret,
    // Tensor Fusion CRDs
    gpupool, gpu, tensorfusionworkload, tensorfusionconnection,
    // Generic
    resource, crd
} from '@repterm/plugin-kubectl';

// Standard resources
const p = pod(kubectl, 'nginx');
const d = deployment(kubectl, 'nginx');

// Tensor Fusion CRDs
const pool = gpupool(kubectl, 'shared-pool');
const workload = tensorfusionworkload(kubectl, 'my-workload');

// Generic resource
const custom = resource(kubectl, 'myresource', 'name');
```

## Expect Matchers

### Existence

```typescript
await expect(pod(kubectl, 'nginx')).toExistInCluster();
await expect(pod(kubectl, 'old-pod')).toNotExistInCluster();
```

### Pod Status

```typescript
await expect(pod(kubectl, 'nginx')).toBeRunning(timeout?);
await expect(pod(kubectl, 'nginx')).toHavePhase('Running');
```

### Replicas

```typescript
await expect(deployment(kubectl, 'nginx')).toHaveReplicas(3);
await expect(deployment(kubectl, 'nginx')).toHaveReadyReplicas(3);
await expect(deployment(kubectl, 'nginx')).toHaveAvailableReplicas(3);
```

### Conditions

```typescript
await expect(deployment(kubectl, 'nginx')).toBeAvailable();
await expect(deployment(kubectl, 'nginx')).toHaveCondition('Available', 'True');
```

### Labels & Annotations

```typescript
await expect(pod(kubectl, 'nginx')).toHaveLabel('app', 'nginx');
await expect(pod(kubectl, 'nginx')).toHaveLabel('app'); // key exists
await expect(pod(kubectl, 'nginx')).toHaveAnnotation('description', 'My app');
```

### Status Fields (Generic)

```typescript
// Check any status field (supports nested paths)
await expect(gpupool(kubectl, 'shared')).toHaveStatusField('phase', 'Running');
await expect(gpu(kubectl, 'gpu-0')).toHaveStatusField('available.tflops', '312');
```

## Examples

See `examples/` directory:

| File | Description |
|------|-------------|
| `00-simple-demo.ts` | Basic plugin setup |
| `01-basic-kubectl.ts` | Core CRUD operations |
| `02-debugging.ts` | logs, exec, describe |
| `03-resource-management.ts` | scale, patch, label |
| `04-rollout.ts` | Rollout management |
| `05-matchers.ts` | All matchers demo |
| `06-advanced.ts` | Port forward, events, nodes |
| `tensor-fusion/` | Tensor Fusion GPU allocation tests |

Run examples:

```bash
# Basic demo (no cluster needed)
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts

# With K8s cluster
bun run repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts

# Tensor Fusion tests
bun run repterm packages/plugin-kubectl/examples/tensor-fusion/
```

## Recording Mode

Tests marked with `{ record: true }` can be recorded:

```typescript
describe('My tests', { record: true }, () => {
    test('creates pod', async (ctx) => {
        // ...
    });
});
```

```bash
# Run with recording
bun run repterm --record packages/plugin-kubectl/examples/
```

## License

MIT
