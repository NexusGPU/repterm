/**
 * Tensor Fusion GPU 资源分配测试 - 共享配置
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/
 *
 * 前置条件:
 *   - 已配置 kubectl 并连接到 Kubernetes 集群
 *   - Tensor Fusion Controller 已部署并运行
 *   - 至少存在一个 GPUPool 和可用 GPU
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

// ===== 常量配置 =====

/** 测试使用的 GPUPool 名称 */
export const TEST_GPU_POOL = 'tensor-fusion-shared';

/** 测试命名空间 */
export const TEST_NAMESPACE = 'default';

/** Tensor Fusion 系统命名空间 */
export const TF_SYSTEM_NAMESPACE = 'tensor-fusion-sys';

/** Controller Deployment 名称 */
export const TF_CONTROLLER_DEPLOYMENT = 'tensor-fusion-sys-controller';

/** 默认等待超时时间 (ms) */
export const DEFAULT_TIMEOUT = 60000;

// ===== 插件配置 =====

export const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: TEST_NAMESPACE })] as const,
});

export const test = createTestWithPlugins(config);

// ===== 导出工具 =====

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

// ===== YAML 模板 =====

/**
 * TensorFusionWorkload 测试模板
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
 * 带 Tensor Fusion Annotation 的 Deployment 模板
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

// ===== 工具函数 =====

/**
 * 获取 GPUPool 中第一个 GPU 名称
 */
export async function getFirstGpuName(kubectl: KubectlMethods): Promise<string> {
  // 使用 jq 过滤出第一个 NVIDIA GPU 的名称
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
 * 获取 GPU 的可用资源
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
 * 解析 TFlops 值为数字（支持带 m 后缀和不带后缀的格式）
 */
export function parseTflops(value: string | number): number {
  const str = String(value);
  if (str.endsWith('m')) {
    return parseInt(str.replace('m', ''), 10);
  }
  // 如果没有 m 后缀，假设单位是 TFlops，转换为 milli
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num * 1000;
}

/**
 * 清理测试资源
 */
export async function cleanup(kubectl: KubectlMethods, resources: Array<{ kind: string; name: string }>) {
  for (const { kind, name } of resources) {
    try {
      await kubectl.delete(kind, name);
    } catch {
      // 忽略删除错误
    }
  }
}
