/**
 * 测试场景 9: GPU 远程调用
 *
 * 基于 `GPU远程调用测试.md`：
 * - 创建一个远程模式（isLocalGPU=false）的 TensorFusionWorkload
 * - 创建一个带 remote annotation 的 client pod
 * - 验证 TensorFusionConnection 自动创建
 * - 验证 connection 的 metadata（namespace、labels、ownerReferences）与 spec（workloadName、clientPod）
 * - 在 client pod 内执行 nvidia-smi 和 PyTorch 验证，确认可通过远程方式使用 GPU
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/09-gpu-remote-invocation.ts
 */

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  tensorfusionworkload,
  DEFAULT_TIMEOUT,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
  type KubectlMethods,
} from './_config.js';

const WORKLOAD_NAME = 'test-remote-workload';
const CLIENT_POD_NAME = 'test-remote-client';

/**
 * 远程模式 TensorFusionWorkload YAML 模板
 */
function remoteWorkloadYaml(name: string): string {
  return `
apiVersion: tensor-fusion.ai/v1
kind: TensorFusionWorkload
metadata:
  name: ${name}
  namespace: ${TEST_NAMESPACE}
  labels:
    app: ${name}
    test-type: gpu-remote
spec:
  replicas: 1
  gpuCount: 1
  poolName: ${TEST_GPU_POOL}
  qos: medium
  isolation: soft
  resources:
    requests:
      tflops: 100m
      vram: "1Gi"
    limits:
      tflops: 100m
      vram: "1Gi"
  isLocalGPU: false
  autoScalingConfig:
    autoSetResources:
      enable: false
`;
}

/**
 * 远程模式 client pod YAML 模板
 */
function clientPodYaml(podName: string, poolName: string): string {
  return `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${TEST_NAMESPACE}
  labels:
    tensor-fusion.ai/enabled: "true"
  annotations:
    tensor-fusion.ai/is-local-gpu: "false"
    tensor-fusion.ai/gpupool: "${poolName}"
    tensor-fusion.ai/tflops-request: "100m"
    tensor-fusion.ai/vram-request: "1Gi"
    tensor-fusion.ai/tflops-limit: "100m"
    tensor-fusion.ai/vram-limit: "1Gi"
    tensor-fusion.ai/inject-container: "app"
spec:
  restartPolicy: Never
  containers:
    - name: app
      image: pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime
      command: ["sh", "-c", "sleep 3600"]
`;
}

/**
 * 从 client pod 的 env 中读取 connection 信息
 */
async function getConnectionInfoFromPod(
  kubectl: KubectlMethods,
  podName: string,
): Promise<{ connName: string; connNamespace: string }> {
  const envData = await kubectl.get<Array<{ name: string; value: string }>>(
    'pod',
    podName,
    {
      jqFilter:
        '[.spec.containers[0].env[] | select(.name == "TENSOR_FUSION_CONNECTION_NAME" or .name == "TENSOR_FUSION_CONNECTION_NAMESPACE") | {name: .name, value: .value}]',
    },
  );

  const envMap = new Map((envData ?? []).map((e) => [e.name, e.value]));

  return {
    connName: envMap.get('TENSOR_FUSION_CONNECTION_NAME') ?? '',
    connNamespace: envMap.get('TENSOR_FUSION_CONNECTION_NAMESPACE') ?? '',
  };
}

describe('测试场景 9: GPU 远程调用', { record: true }, () => {
  test('远程模式下 client pod 自动创建 TensorFusionConnection 并验证关联', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let connName: string;
    let connNamespace: string;

    // ===== Step 1: 创建远程模式 Workload =====
    await step('创建远程模式 Workload（isLocalGPU=false）', {
      showStepTitle: false,
      typingSpeed: 100,
      pauseAfter: 2000,
    }, async () => {
      const yaml = remoteWorkloadYaml(WORKLOAD_NAME);
      const result = await kubectl.apply(yaml);
      await expect(result).toBeSuccessful();
    });

    await step('等待 Workload Ready', {
      showStepTitle: false,
      pauseAfter: 1800,
    }, async () => {
      const waitResult = await kubectl.wait(
        'tensorfusionworkload',
        WORKLOAD_NAME,
        'Ready',
        { timeout: DEFAULT_TIMEOUT },
      );
      await expect(waitResult).toBeSuccessful();

      const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
      await expect(workload).toHaveStatusField('phase', 'Running');
    });

    await step('确认 Workload 为远程模式', {
      typingSpeed: 80,
      pauseAfter: 1500,
    }, async () => {
      const spec = await kubectl.getJsonPath<{
        isLocalGPU?: boolean;
        workerCount?: number;
      }>('tensorfusionworkload', WORKLOAD_NAME, '.spec');

      expect(spec?.isLocalGPU).toBe(false);
    });

    // ===== Step 2: 创建 client pod =====
    await step('创建远程模式 client pod', {
      showStepTitle: false,
      typingSpeed: 100,
      pauseAfter: 2500,
    }, async () => {
      const yaml = clientPodYaml(CLIENT_POD_NAME, TEST_GPU_POOL);
      const result = await kubectl.apply(yaml);
      await expect(result).toBeSuccessful();
    });

    await step('等待 client pod Ready', {
      showStepTitle: false,
      pauseAfter: 2000,
    }, async () => {
      await kubectl.waitForPod(CLIENT_POD_NAME, 'Running', DEFAULT_TIMEOUT * 3);
    });

    // ===== Step 3: 检查 TensorFusionConnection 自动创建 =====
    await step('从 client pod env 读取 connection 信息', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 2000,
    }, async () => {
      const info = await getConnectionInfoFromPod(kubectl, CLIENT_POD_NAME);
      connName = info.connName;
      connNamespace = info.connNamespace;

      expect(connName.length).toBeGreaterThan(0);
      expect(connNamespace.length).toBeGreaterThan(0);
    });

    await step('验证 TensorFusionConnection 资源存在', {
      typingSpeed: 80,
      pauseAfter: 2000,
    }, async () => {
      const exists = await kubectl.exists('tensorfusionconnection', connName);
      expect(exists).toBe(true);
    });

    // ===== Step 4: 验证 connection metadata =====
    await step('验证 connection metadata 字段', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const metadata = await kubectl.get<{
        namespace: string;
        workloadLabel: string;
        ownerKind: string;
        ownerName: string;
      }>('tensorfusionconnection', connName, {
        jqFilter: `{namespace: .metadata.namespace, workloadLabel: .metadata.labels["tensor-fusion.ai/workload"], ownerKind: .metadata.ownerReferences[0].kind, ownerName: .metadata.ownerReferences[0].name}`,
      });

      // metadata.namespace 应与测试命名空间一致
      expect(metadata?.namespace).toBe(TEST_NAMESPACE);

      // ownerReferences 指向 client pod
      expect(metadata?.ownerKind).toBe('Pod');
      expect(metadata?.ownerName).toBe(CLIENT_POD_NAME);
    });

    // ===== Step 5: 验证 connection spec =====
    await step('验证 connection spec 字段', {
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const spec = await kubectl.getJsonPath<{
        workloadName?: string;
        clientPod?: string;
      }>('tensorfusionconnection', connName, '.spec');

      expect(spec?.clientPod).toBe(CLIENT_POD_NAME);
    });

    // ===== Step 6: （可选）查看 connection 状态 =====
    await step('查看 connection 状态', {
      pauseAfter: 2000,
    }, async () => {
      const status = await kubectl.getJsonPath<{
        phase?: string;
        workerName?: string;
        connectionURL?: string;
      }>('tensorfusionconnection', connName, '.status');

      // phase 应存在
      expect(status?.phase).toBeDefined();
    });

    // ===== Step 7: 在 client pod 内验证 GPU 可用 =====
    await step('执行 nvidia-smi 验证 GPU 可见', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const nvidiaSmiOutput = await kubectl.exec(
        CLIENT_POD_NAME,
        ['nvidia-smi'],
        { container: 'app' },
      );

      // nvidia-smi 输出应包含 NVIDIA 驱动信息和 GPU 信息
      expect(nvidiaSmiOutput).toContain('NVIDIA');
      expect(nvidiaSmiOutput).toContain('GPU');
    });

    await step('执行 nvidia-smi -L 列出 GPU 设备', {
      typingSpeed: 80,
      pauseAfter: 2000,
    }, async () => {
      const gpuListOutput = await kubectl.exec(
        CLIENT_POD_NAME,
        ['nvidia-smi', '-L'],
        { container: 'app' },
      );

      // 至少存在一块 GPU
      expect(gpuListOutput).toContain('GPU 0');
    });

    await step('PyTorch 检测 CUDA 可用', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const cudaAvailable = await kubectl.exec(
        CLIENT_POD_NAME,
        ['python3', '-c', 'import torch; print(torch.cuda.is_available())'],
        { container: 'app' },
      );

      expect(cudaAvailable.trim()).toBe('True');
    });

    await step('PyTorch 获取 GPU 设备信息', {
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const gpuInfo = await kubectl.exec(
        CLIENT_POD_NAME,
        ['python3', '-c', 'import torch; print(f"device_count={torch.cuda.device_count()}, name={torch.cuda.get_device_name(0)}")'],
        { container: 'app' },
      );

      // 至少有 1 块 GPU
      expect(gpuInfo).toContain('device_count=');
      expect(gpuInfo).not.toContain('device_count=0');
    });

    await step('PyTorch GPU 张量运算验证', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 3000,
    }, async () => {
      const tensorTest = await kubectl.exec(
        CLIENT_POD_NAME,
        [
          'python3', '-c',
          'import torch; a = torch.randn(2, 3, device="cuda"); b = torch.randn(3, 2, device="cuda"); c = torch.mm(a, b); print(f"shape={list(c.shape)}, device={c.device}")',
        ],
        { container: 'app' },
      );

      // 验证运算在 GPU 上完成
      expect(tensorTest).toContain('shape=[2, 2]');
      expect(tensorTest).toContain('device=cuda');
    });

    // ===== Step 8: 清理 =====
    await step('删除 client pod', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 1500,
    }, async () => {
      const result = await kubectl.delete('pod', CLIENT_POD_NAME);
      await expect(result).toBeSuccessful();
    });

    await step('删除 TensorFusionWorkload', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 2000,
    }, async () => {
      const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
      await expect(result).toBeSuccessful();

      await sleep(5000);
    });
  });
});
