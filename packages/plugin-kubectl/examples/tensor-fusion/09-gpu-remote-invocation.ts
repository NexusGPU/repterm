/**
 * Test Scenario 9: GPU Remote Invocation
 *
 * - Create a client pod with remote GPU annotations (webhook auto-creates workload + connection)
 * - Verify TensorFusionConnection is automatically created
 * - Verify connection metadata (namespace, labels, ownerReferences) and spec
 * - Execute nvidia-smi and PyTorch verification in client pod to confirm remote GPU usage
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/09-gpu-remote-invocation.ts
 */

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  DEFAULT_TIMEOUT,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
  type KubectlMethods,
} from './_config.js';

const CLIENT_POD_NAME = 'test-remote-client';

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
  priorityClassName: tensor-fusion-high
  nodeSelector:
    kubernetes.io/hostname: cpu
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

    // ===== Step 1: 创建 client pod（webhook 自动创建 workload + connection）=====
    await step('创建远程模式 client pod', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const yaml = clientPodYaml(CLIENT_POD_NAME, TEST_GPU_POOL);
      const result = await kubectl.apply(yaml);
      await expect(result).toBeSuccessful();
    });

    await step('等待 client pod Ready', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      await kubectl.waitForPod(CLIENT_POD_NAME, 'Running', DEFAULT_TIMEOUT * 3);
    });

    // ===== Step 2: 检查 TensorFusionConnection 自动创建 =====
    await step('从 client pod env 读取 connection 信息', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      const info = await getConnectionInfoFromPod(kubectl, CLIENT_POD_NAME);
      connName = info.connName;
      connNamespace = info.connNamespace;

      expect(connName.length).toBeGreaterThan(0);
      expect(connNamespace.length).toBeGreaterThan(0);
    });

    await step('验证 TensorFusionConnection 资源存在', {
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      const exists = await kubectl.exists('tensorfusionconnection', connName);
      expect(exists).toBe(true);
    });

    // ===== Step 3: 验证 connection metadata =====
    await step('验证 connection metadata 字段', {
      showStepTitle: false,
      typingSpeed: 0,
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

    // ===== Step 4: 验证 connection spec =====
    await step('验证 connection spec 字段', {
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const spec = await kubectl.getJsonPath<{
        workloadName?: string;
        clientPod?: string;
      }>('tensorfusionconnection', connName, '.spec');

      expect(spec?.clientPod).toBe(CLIENT_POD_NAME);
    });

    // ===== Step 5: 查看 connection 状态 =====
    await step('查看 connection 状态', {
      typingSpeed: 0,
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

    // ===== Step 6: 在 client pod 内验证 GPU 可用 =====
    // 远程模式下 TF client 通过 LD_PRELOAD 注入 libadd_path.so 修改 PATH，
    // 需要通过 sh -c 包装命令让 LD_PRELOAD 生效。
    await step('执行 nvidia-smi 验证 GPU 可见', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const nvidiaSmiOutput = await kubectl.exec(
        CLIENT_POD_NAME,
        ['sh', '-c', 'nvidia-smi'],
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
        ['sh', '-c', 'nvidia-smi -L'],
        { container: 'app' },
      );

      // 至少存在一块 GPU
      expect(gpuListOutput).toContain('GPU 0');
    });

    await step('PyTorch 检测 CUDA 可用', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const cudaAvailable = await kubectl.exec(
        CLIENT_POD_NAME,
        ['sh', '-c', 'python3 -c "import torch; print(torch.cuda.is_available())"'],
        { container: 'app' },
      );

      expect(cudaAvailable.trim()).toBe('True');
    });

    await step('PyTorch 获取 GPU 设备信息', {
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const gpuInfo = await kubectl.exec(
        CLIENT_POD_NAME,
        ['sh', '-c', 'python3 -c "import torch; print(f\'device_count={torch.cuda.device_count()}, name={torch.cuda.get_device_name(0)}\')"'],
        { container: 'app' },
      );

      // 至少有 1 块 GPU
      expect(gpuInfo).toContain('device_count=');
      expect(gpuInfo).not.toContain('device_count=0');
    });

    await step('PyTorch GPU 张量运算验证', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 3000,
    }, async () => {
      const tensorTest = await kubectl.exec(
        CLIENT_POD_NAME,
        ['sh', '-c', 'python3 -c "import torch; a = torch.randn(2, 3, device=\'cuda\'); b = torch.randn(3, 2, device=\'cuda\'); c = torch.mm(a, b); print(f\'shape={list(c.shape)}, device={c.device}\')"'],
        { container: 'app' },
      );

      // 验证运算在 GPU 上完成
      expect(tensorTest).toContain('shape=[2, 2]');
      expect(tensorTest).toContain('device=cuda');
    });

    // ===== Step 7: 清理 =====
    await step('删除 client pod', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 1500,
    }, async () => {
      const result = await kubectl.delete('pod', CLIENT_POD_NAME);
      await expect(result).toBeSuccessful();

      await sleep(5000);
    });
  });
});
