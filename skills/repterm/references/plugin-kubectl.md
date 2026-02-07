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
3. hooks: before/after test debug

## 4. Main API

### 4.1 Run and read

- run(args): run kubectl, return output.
- command(args): build command string only.
- `get(resource, name?, options?)`:
  - Default: parsed JSON.
  - options.jqFilter appends | jq ...
  - watch: true returns WatchProcess (interrupt()).
- `getJsonPath(resource, name, jsonPath, options?)`
- `exists(resource, name)`
- `clusterInfo()`

### 4.2 Resource lifecycle

- `apply(yaml)`
- `delete(resource, name, { force? })`
- `waitForPod(name, status?, timeout?)`
- `wait(resource, name, condition, { timeout?, forDelete? })`
- `waitForJsonPath(resource, name, jsonPath, value, timeout?)`
- `waitForReplicas(resource, name, count, timeout?)`
- `waitForService(name, timeout?)`

### 4.3 Operations

- `logs(pod, options?)`
- `exec(pod, command, options?)`
- `describe(resource, name?)`
- `scale(resource, name, replicas)`
- `patch(resource, name, patch, type?)`
- `label(resource, name, labels)`
- `annotate(resource, name, annotations)`
- `rollout.status/history/undo/restart/pause/resume`
- `portForward(resource, ports, options?)` (returns stop())
- `getEvents(options?)`
- `getNodes(options?)`
- `cp(source, dest, options?)`

## 5. Watch and PTY

1. get(..., { watch: true }) returns controller; must await watch.interrupt().
2. In recording/PTY, plugin may use silent run for clean JSON.
3. Prefer silent or non-PTY for exit code assertions.

## 6. Matchers and resource wrappers

matchers.ts registers:

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

## See Also

- [api-cheatsheet.md](api-cheatsheet.md)
- [common-patterns.md](common-patterns.md)
- [troubleshooting.md](troubleshooting.md)
