/**
 * Tensor Fusion GPU Resource Allocation Tests - Shared Configuration
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/
 *
 * Prerequisites:
 *   - kubectl configured and connected to Kubernetes cluster
 *   - Tensor Fusion Controller deployed and running
 *   - At least one GPUPool with available GPU exists
 */

import { sleep } from 'bun';
import {
  describe,
  defineConfig,
  createTestWithPlugins,
  expect,
  test as baseTest,
  step,
} from 'repterm';
import {
  kubectlPlugin,
  gpupool,
  gpu,
  tensorfusionworkload,
  tensorfusionconnection,
  pod,
  deployment,
  resource,
  type KubectlMethods,
} from '@nexusgpu/repterm-plugin-kubectl';

// ===== Configuration Constants =====

/** GPUPool name used for testing */
export const TEST_GPU_POOL = 'tensor-fusion-shared';

/** Test namespace */
export const TEST_NAMESPACE = 'default';

/** Tensor Fusion system namespace */
export const TF_SYSTEM_NAMESPACE = 'tensor-fusion-sys';

/** Controller Deployment name */
export const TF_CONTROLLER_DEPLOYMENT = 'tensor-fusion-sys-controller';

/** Default timeout duration (ms) */
export const DEFAULT_TIMEOUT = 60000;

/** Named timeout constants for common scenarios */
export const TIMEOUTS = {
  DEFAULT: 60_000,
  LONG: 120_000,
  POD_READY: 180_000,
  CUDA_READY: 180_000,
  RESOURCE_RECOVERY: 240_000,
  INFERENCE: 600_000,
  MODEL_LOADING: 900_000,
} as const;

/**
 * PyTorch client image used by test pods.
 * Uses the base registry tag so it can be pulled from registry on fresh nodes.
 * The build script (scripts/build-tf-test-images.ts) overwrites this tag in the
 * local containerd cache with a pre-built version (pip packages + model files),
 * so nodes with a warm cache get the enhanced version transparently.
 */
export const PYTORCH_IMAGE =
  'registry.cn-hangzhou.aliyuncs.com/tensorfusion/pytorch:2.6.0-cuda12.4-cudnn9-runtime';

// ===== Plugin Configuration =====

export const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: TEST_NAMESPACE })] as const,
});

export const test = createTestWithPlugins(config);

// ===== Exports =====

export {
  describe,
  expect,
  step,
  gpupool,
  gpu,
  tensorfusionworkload,
  tensorfusionconnection,
  pod,
  deployment,
  resource,
};

export type { KubectlMethods };

// ===== YAML Templates =====

/**
 * TensorFusionWorkload test template
 */
export const workloadYaml = (
  name: string,
  options: {
    tflopsRequest?: string;
    tflopsLimit?: string;
    vramRequest?: string;
    vramLimit?: string;
    replicas?: number;
    gpuCount?: number;
    poolName?: string;
    isLocalGPU?: boolean;
  } = {}
) => `
apiVersion: tensor-fusion.ai/v1
kind: TensorFusionWorkload
metadata:
  name: ${name}
  namespace: ${TEST_NAMESPACE}
  labels:
    app: ${name}
    test-type: gpu-allocation
spec:
  replicas: ${options.replicas ?? 1}
  gpuCount: ${options.gpuCount ?? 1}
  poolName: ${options.poolName ?? TEST_GPU_POOL}
  qos: medium
  isolation: soft
  resources:
    requests:
      tflops: ${options.tflopsRequest ?? '1000m'}
      vram: "${options.vramRequest ?? '1Gi'}"
    limits:
      tflops: ${options.tflopsLimit ?? '2000m'}
      vram: "${options.vramLimit ?? '2Gi'}"
  isLocalGPU: ${options.isLocalGPU ?? false}
  autoScalingConfig:
    autoSetResources:
      enable: false
`;

/**
 * Deployment template with Tensor Fusion Annotations
 */
export const annotatedDeploymentYaml = (
  name: string,
  options: {
    tflopsRequest?: string;
    tflopsLimit?: string;
    vramRequest?: string;
    vramLimit?: string;
    poolName?: string;
  } = {}
) => `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${TEST_NAMESPACE}
  labels:
    app: ${name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
        tensor-fusion.ai/enabled: "true"
      annotations:
        tensor-fusion.ai/gpu-pool: "${options.poolName ?? TEST_GPU_POOL}"
        tensor-fusion.ai/gpu-count: "1"
        tensor-fusion.ai/tflops-request: "${options.tflopsRequest ?? '1000m'}"
        tensor-fusion.ai/tflops-limit: "${options.tflopsLimit ?? '2000m'}"
        tensor-fusion.ai/vram-request: "${options.vramRequest ?? '1Gi'}"
        tensor-fusion.ai/vram-limit: "${options.vramLimit ?? '2Gi'}"
        tensor-fusion.ai/qos: "medium"
        tensor-fusion.ai/isolation: "soft"
        tensor-fusion.ai/is-local-gpu: "false"
        tensor-fusion.ai/sidecar-worker: "false"
    spec:
      containers:
      - name: test
        image: ${PYTORCH_IMAGE}
        command: ["sh", "-c", "sleep 99d"]
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
`;

// ===== Utility Functions =====

/**
 * Get the first GPU name from GPUPool
 */
export async function getFirstGpuName(kubectl: KubectlMethods): Promise<string> {
  // Filter first NVIDIA GPU name using jq
  const result = await kubectl.get<string>('gpu', '', {
    selector: `tensor-fusion.ai/gpupool=${TEST_GPU_POOL}`,
    jqFilter:
      '[.items[] | select(.status.vendor | ascii_downcase == "nvidia")][0] | .metadata.name',
  });

  const gpuName = typeof result === 'string' ? result.trim() : '';

  if (!gpuName) {
    throw new Error(`No NVIDIA GPU found in pool ${TEST_GPU_POOL}`);
  }

  return gpuName;
}

/**
 * Get available resources of a GPU
 */
export async function getGpuAvailable(
  kubectl: KubectlMethods,
  gpuName: string
): Promise<{
  tflops: string;
  vram: string;
}> {
  const available = await kubectl.getJsonPath<{ tflops?: string | number; vram?: string }>(
    'gpu',
    gpuName,
    '.status.available'
  );

  return {
    tflops: String(available?.tflops ?? '0'),
    vram: String(available?.vram ?? '0'),
  };
}

/**
 * Parse TFlops value to number (supports both 'm' suffix and non-suffixed formats)
 */
export function parseTflops(value: string | number): number {
  const str = String(value);
  if (str.endsWith('m')) {
    return parseInt(str.replace('m', ''), 10);
  }
  // If no 'm' suffix, assume unit is TFlops, convert to milli
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num * 1000;
}

interface DeleteResourceOptions {
  timeoutMs?: number;
  intervalMs?: number;
  force?: boolean;
  throwOnTimeout?: boolean;
}

/**
 * Delete a resource and wait until it is fully removed.
 * This avoids immutable-field errors when reusing fixed names across reruns.
 *
 * If the resource is stuck in a deleting state (has `deletionTimestamp` but
 * finalizers prevent removal), this function will patch the resource to remove
 * all finalizers after `finalizerPatchAfterMs` (default 15 s).
 */
export async function deleteResourceAndWait(
  kubectl: KubectlMethods,
  kind: string,
  name: string,
  options: DeleteResourceOptions = {}
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 120000;
  const intervalMs = options.intervalMs ?? 2000;
  const deadline = Date.now() + timeoutMs;
  const deleteStart = Date.now();
  let finalizerPatched = false;

  try {
    // Use nowait + typingSpeed:0 for cleanup: don't block on finalizers
    // and don't waste time on character-by-character typing in recordings.
    await kubectl.delete(kind, name, {
      ...(options.force ? { force: true } : {}),
      nowait: true,
      typingSpeed: 0,
    });
  } catch {
    // Best effort cleanup path; continue polling for absence.
  }

  while (Date.now() < deadline) {
    const exists = await kubectl.exists(kind, name);
    if (!exists) {
      return true;
    }

    // After 15s, check if the resource is stuck on unprocessed finalizers.
    if (!finalizerPatched && Date.now() - deleteStart > 15000) {
      try {
        const check = Bun.spawn(
          ['kubectl', '-n', TEST_NAMESPACE, 'get', kind, name,
           '-o', 'jsonpath={.metadata.deletionTimestamp}'],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        const ts = await new Response(check.stdout).text();
        await check.exited;

        if (ts.trim()) {
          // Resource is stuck — remove all finalizers so it can be garbage-collected.
          const patch = Bun.spawn(
            ['kubectl', '-n', TEST_NAMESPACE, 'patch', kind, name,
             '-p', '{"metadata":{"finalizers":null}}', '--type=merge'],
            { stdout: 'pipe', stderr: 'pipe' },
          );
          await patch.exited;
          finalizerPatched = true;
        }
      } catch {
        // Best effort — continue polling.
      }
    }

    await sleep(intervalMs);
  }

  if (options.throwOnTimeout) {
    throw new Error(`Timeout waiting for ${kind}/${name} deletion after ${timeoutMs}ms`);
  }

  return false;
}

/**
 * Poll until torch.cuda.is_available() reports True.
 */
export async function waitForCudaReady(
  kubectl: KubectlMethods,
  podName: string,
  container: string,
  timeoutMs = 180000,
  intervalMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastLine = '';

  while (Date.now() < deadline) {
    const output = await kubectl.exec(
      podName,
      ['sh', '-c', 'python3 -c "import torch; print(torch.cuda.is_available())"'],
      { container }
    );

    const lines = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    lastLine = lines[lines.length - 1] ?? '';

    if (lastLine === 'True') {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `CUDA not ready in pod/${podName} within ${timeoutMs}ms (last output: ${lastLine || 'empty'})`
  );
}

// ===== Client Pod Template =====

/**
 * Remote-mode client pod YAML template.
 * The webhook auto-creates a TensorFusionWorkload + TensorFusionConnection.
 */
export const clientPodYaml = (
  name: string,
  options: {
    poolName?: string;
    tflopsRequest?: string;
    tflopsLimit?: string;
    vramRequest?: string;
    vramLimit?: string;
    image?: string;
    command?: string;
    injectContainer?: string;
  } = {}
) => `
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${TEST_NAMESPACE}
  labels:
    tensor-fusion.ai/enabled: "true"
  annotations:
    tensor-fusion.ai/is-local-gpu: "false"
    tensor-fusion.ai/gpupool: "${options.poolName ?? TEST_GPU_POOL}"
    tensor-fusion.ai/tflops-request: "${options.tflopsRequest ?? '100m'}"
    tensor-fusion.ai/vram-request: "${options.vramRequest ?? '1Gi'}"
    tensor-fusion.ai/tflops-limit: "${options.tflopsLimit ?? '100m'}"
    tensor-fusion.ai/vram-limit: "${options.vramLimit ?? '1Gi'}"
    tensor-fusion.ai/inject-container: "${options.injectContainer ?? 'app'}"
spec:
  priorityClassName: tensor-fusion-high
  nodeSelector:
    kubernetes.io/hostname: cpu
  restartPolicy: Never
  containers:
    - name: app
      image: ${options.image ?? PYTORCH_IMAGE}
      command: ["sh", "-c", "${options.command ?? 'sleep 3600'}"]
`;

// ===== Additional Utility Functions =====

/**
 * Read TensorFusionConnection info from a client pod's environment variables.
 */
export async function getConnectionInfoFromPod(
  kubectl: KubectlMethods,
  podName: string
): Promise<{ connName: string; connNamespace: string }> {
  const envData = await kubectl.get<Array<{ name: string; value: string }>>('pod', podName, {
    jqFilter:
      '[.spec.containers[0].env[] | select(.name == "TENSOR_FUSION_CONNECTION_NAME" or .name == "TENSOR_FUSION_CONNECTION_NAMESPACE") | {name: .name, value: .value}]',
  });

  const envMap = new Map((envData ?? []).map((e) => [e.name, e.value]));

  return {
    connName: envMap.get('TENSOR_FUSION_CONNECTION_NAME') ?? '',
    connNamespace: envMap.get('TENSOR_FUSION_CONNECTION_NAMESPACE') ?? '',
  };
}

/**
 * Get the first GPUNode name from the cluster.
 */
export async function getFirstGpuNodeName(kubectl: KubectlMethods): Promise<string> {
  const result = await kubectl.get<string>('gpunode', '', {
    jqFilter: '.items[0].metadata.name',
  });

  const name = typeof result === 'string' ? result.trim() : '';

  if (!name) {
    throw new Error('No GPUNode found in cluster');
  }

  return name;
}

/**
 * Get running worker pod names for a given workload (excludes terminating pods).
 */
export async function getWorkerPodNames(
  kubectl: KubectlMethods,
  workloadName: string
): Promise<string[]> {
  const pods = await kubectl.get<Array<{ name: string }>>('pod', undefined, {
    selector: `tensor-fusion.ai/workload=${workloadName},tensor-fusion.ai/component=worker`,
    jqFilter:
      '[.items[] | select(.metadata.deletionTimestamp == null) | {name: .metadata.name}]',
  });

  return (pods ?? []).map((p) => p.name);
}

/**
 * Get the count of running worker pods for a given workload.
 */
export async function getWorkerPodCount(
  kubectl: KubectlMethods,
  workloadName: string
): Promise<number> {
  return (await getWorkerPodNames(kubectl, workloadName)).length;
}

/**
 * Parse a Kubernetes resource quantity string to a raw number.
 * Supports binary suffixes (Ki, Mi, Gi, ...) and decimal suffixes (K, M, G, m, ...).
 */
export function parseResourceBytes(value: string | number): number {
  const text = String(value).trim();
  if (!text) return 0;

  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z]+)?$/);
  if (!match) return Number(text) || 0;

  const num = Number(match[1]);
  const unit = match[2] ?? '';

  const binaryUnits: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };

  const decimalUnits: Record<string, number> = {
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
    m: 0.001,
  };

  if (binaryUnits[unit] !== undefined) return num * binaryUnits[unit];
  if (decimalUnits[unit] !== undefined) return num * decimalUnits[unit];
  return num;
}

/**
 * Generic polling helper. Polls `fn` every `intervalMs` until `predicate`
 * returns true, or throws after `timeoutMs`.
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT, intervalMs = 3000, description } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await fn();
    if (predicate(value)) return value;
    await sleep(intervalMs);
  }

  throw new Error(`Timeout after ${timeoutMs}ms${description ? `: ${description}` : ''}`);
}
