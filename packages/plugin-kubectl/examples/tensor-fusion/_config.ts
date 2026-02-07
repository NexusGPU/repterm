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
} from '../../src/index.js';

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
export const workloadYaml = (name: string, options: {
  tflopsRequest?: string;
  tflopsLimit?: string;
  vramRequest?: string;
  vramLimit?: string;
  replicas?: number;
  poolName?: string;
} = {}) => `
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
  gpuCount: 1
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
  isLocalGPU: true
  gpuIndices:
    - 0
  autoScalingConfig:
    autoSetResources:
      enable: false
`;

/**
 * Deployment template with Tensor Fusion Annotations
 */
export const annotatedDeploymentYaml = (name: string, options: {
  tflopsRequest?: string;
  tflopsLimit?: string;
  vramRequest?: string;
  vramLimit?: string;
  poolName?: string;
} = {}) => `
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
      annotations:
        tensor-fusion.ai/gpu-pool: "${options.poolName ?? TEST_GPU_POOL}"
        tensor-fusion.ai/gpu-count: "1"
        tensor-fusion.ai/tflops-request: "${options.tflopsRequest ?? '1000m'}"
        tensor-fusion.ai/tflops-limit: "${options.tflopsLimit ?? '2000m'}"
        tensor-fusion.ai/vram-request: "${options.vramRequest ?? '1Gi'}"
        tensor-fusion.ai/vram-limit: "${options.vramLimit ?? '2Gi'}"
        tensor-fusion.ai/qos: "medium"
        tensor-fusion.ai/isolation: "soft"
        tensor-fusion.ai/is-local-gpu: "true"
        tensor-fusion.ai/gpu-indices: "0"
    spec:
      containers:
      - name: test-container
        image: nginx:alpine
        command: ["sleep", "infinity"]
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
    jqFilter: '[.items[] | select(.status.vendor | ascii_downcase == "nvidia")][0] | .metadata.name'
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
export async function getGpuAvailable(kubectl: KubectlMethods, gpuName: string): Promise<{
  tflops: string;
  vram: string;
}> {
  const available = await kubectl.getJsonPath<{ tflops?: string | number; vram?: string }>(
    'gpu', gpuName, '.status.available'
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

/**
 * Clean up test resources
 */
export async function cleanup(kubectl: KubectlMethods, resources: Array<{ kind: string; name: string }>) {
  for (const { kind, name } of resources) {
    try {
      await kubectl.delete(kind, name);
    } catch {
      // Ignore deletion errors
    }
  }
}
