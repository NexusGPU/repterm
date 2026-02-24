# @nexusgpu/repterm-plugin-kubectl guide

## 1. Where to look

- Core: `packages/plugin-kubectl/src/index.ts`
- Matchers: `packages/plugin-kubectl/src/matchers.ts`
- Types: `packages/plugin-kubectl/src/matchers.d.ts`
- Examples: `packages/plugin-kubectl/examples/*.ts`

## 2. Setup

```ts
import { defineConfig, createTestWithPlugins } from 'repterm';
import { kubectlPlugin } from '@nexusgpu/repterm-plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);
```

> Prefer defineConfig(); avoid manual runtime setup.

## 3. Plugin structure

kubectlPlugin returns definePlugin('kubectl', setup). setup exposes:

1. methods -> ctx.plugins.kubectl
2. context -> ctx.kubectl (namespace / kubeconfig)
3. hooks:
   - `beforeTest(ctx)` — runs before each test
   - `afterTest(ctx, error?)` — runs after each test (receives error if failed)

## 4. Main API

### 4.1 Run and read

- `run(args)`: run kubectl, return output.
- `command(args)`: build command string only (no execution).
- `setNamespace(namespace)` / `getNamespace()` / `getKubeconfig()`
- `get(resource, name?, options?)`:
  - Default: parsed JSON.
  - options: `{ selector?, fieldSelector?, allNamespaces?, jqFilter?, watch?, output? }`
  - watch: true returns WatchProcess (must call interrupt()).
- `getJsonPath(resource, name, jsonPath, options?)`
- `exists(resource, name)` → boolean
- `clusterInfo()` → `{ reachable, controlPlane?, coreDNS?, serverVersion?, error? }`

### 4.2 Resource lifecycle

- `apply(yaml)` → ApplyResult
- `delete(resource, name, { force? })` → DeleteResult (treats "not found" as success)
- `waitForPod(name, status?, timeout?)` — status: "Running" | "Succeeded" | "Failed" | "Pending" (default: "Running"), timeout default: 60000
- `wait(resource, name, condition, { timeout?, forDelete? })` — condition e.g. "Available"
- `waitForJsonPath(resource, name, jsonPath, value, timeout?)`
- `waitForReplicas(resource, name, count, timeout?)`
- `waitForService(name, timeout?)` — waits for `.subsets[0].addresses` via JSONPath

### 4.3 Operations

- `logs(pod, { container?, follow?, tail?, since?, previous? })`
- `exec(pod, command, { container? })`
- `describe(resource, name?)`
- `scale(resource, name, replicas)` → ScaleResult
- `patch(resource, name, patch, type?)` — type: "strategic" (default) | "merge" | "json"
- `label(resource, name, labels)` → LabelResult
- `annotate(resource, name, annotations)`
- `rollout.status/history/undo/restart/pause/resume` — undo accepts optional revision
- `portForward(resource, ports, { address?, delay? })` → `{ localPort, stop() }` (delay default: 2000ms)
- `getEvents({ fieldSelector? })`
- `getNodes({ selector? })`
- `cp(source, dest, { container? })`

## 5. Watch and PTY

1. get(..., { watch: true }) returns controller; must await watch.interrupt().
2. In recording/PTY, plugin may use silent run for clean JSON.
3. Prefer silent or non-PTY for exit code assertions.

## 6. Matchers and resource wrappers

matchers.ts registers:

- `toBeSuccessful` — for KubectlResult (apply/delete/patch/scale/label/wait)
- `toExistInCluster`
- `toNotExistInCluster`
- `toBeRunning(timeout?)` — optional timeout for polling
- `toHavePhase(phase)`
- `toHaveReplicas(count)`
- `toHaveReadyReplicas(count)`
- `toHaveAvailableReplicas(count)`
- `toBeAvailable` — checks Available condition
- `toHaveLabel(key, value?)` — value is optional (checks key existence if omitted)
- `toHaveAnnotation(key, value?)` — value is optional
- `toHaveCondition(type, status)`
- `toHaveStatusField(path, value)` — supports dot notation for nested paths (e.g. `'containerStatuses.0.ready'`)

Resource wrappers:

- Standard: `pod` / `deployment` / `service` / `statefulset` / `job` / `configmap` / `secret` / `resource` / `crd`
- CRD helpers: `gpupool` / `gpu` / `tensorfusionworkload` / `tensorfusionconnection`

> CRD helpers only; no separate Tensor Fusion section.

## 7. Example template

```ts
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod, deployment } from '@nexusgpu/repterm-plugin-kubectl';

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

## 8. Run commands

```bash
# No cluster
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts

# With cluster
bun run repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
bun run repterm packages/plugin-kubectl/examples/05-matchers.ts
```
