/**
 * Test Scenario 10: PyTorch MNIST Training (Remote GPU)
 *
 * - Create a client pod with remote GPU annotations and hostPath mount for Demo scripts
 * - Verify remote GPU is accessible via CUDA
 * - Run MNIST training in dry-run mode (single pass, 1 epoch) via pre-deployed script
 * - Verify training output contains expected loss and accuracy information
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/10-pytorch-mnist-training.ts
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
} from './_config.js';

const POD_NAME = 'test-mnist-training';
const PYTORCH_IMAGE = 'registry.cn-hangzhou.aliyuncs.com/tensorfusion/pytorch:2.6.0-cuda12.4-cudnn9-runtime';

function podYaml(podName: string, poolName: string): string {
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
    tensor-fusion.ai/tflops-request: "2"
    tensor-fusion.ai/vram-request: "128Mi"
    tensor-fusion.ai/tflops-limit: "71200m"
    tensor-fusion.ai/vram-limit: "15Gi"
    tensor-fusion.ai/inject-container: "python"
spec:
  priorityClassName: tensor-fusion-high
  nodeSelector:
    kubernetes.io/hostname: cpu
  restartPolicy: Never
  terminationGracePeriodSeconds: 3
  containers:
    - name: python
      image: ${PYTORCH_IMAGE}
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          cpu: 10m
          memory: 64Mi
        limits:
          cpu: "4"
          memory: 16Gi
      volumeMounts:
        - name: demo-files
          mountPath: /workspace/Demo
  volumes:
    - name: demo-files
      hostPath:
        path: /home/ubuntu/Demo
        type: DirectoryOrCreate
`;
}

describe('测试场景 10: PyTorch MNIST 训练', { record: true }, () => {
  test('远程 GPU 模式下执行 MNIST 训练并验证结果', { timeout: 600000 }, async (ctx) => {
    const { kubectl } = ctx.plugins;

    await step('创建 MNIST 训练 pod', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const yaml = podYaml(POD_NAME, TEST_GPU_POOL);
      const result = await kubectl.apply(yaml);
      await expect(result).toBeSuccessful();
    });

    await step('等待 pod 就绪', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      await kubectl.waitForPod(POD_NAME, 'Running', DEFAULT_TIMEOUT * 3);
    });

    await step('验证远程 GPU 可用', {
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const cudaAvailable = await kubectl.exec(
        POD_NAME,
        ['sh', '-c', 'python3 -c "import torch; print(torch.cuda.is_available())"'],
        { container: 'python' },
      );
      expect(cudaAvailable.trim()).toBe('True');
    });

    await step('查看 GPU 设备信息', {
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      const gpuInfo = await kubectl.exec(
        POD_NAME,
        ['sh', '-c', 'python3 -c "import torch; print(f\'device_count={torch.cuda.device_count()}, name={torch.cuda.get_device_name(0)}\')"'],
        { container: 'python' },
      );
      expect(gpuInfo).toContain('device_count=');
      expect(gpuInfo).not.toContain('device_count=0');
    });

    await step('执行 MNIST 训练 (dry-run, 1 epoch)', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 3000,
    }, async () => {
      const output = await kubectl.exec(
        POD_NAME,
        ['sh', '-c', 'cd /workspace && python3 /workspace/Demo/mnist.py --dry-run --epochs 1'],
        { container: 'python', timeout: 600000 },
      );

      // 验证训练输出包含 epoch 和 loss
      expect(output).toContain('Train Epoch: 1');
      expect(output).toContain('Loss:');
      // 验证测试集评估输出
      expect(output).toContain('Test set:');
      expect(output).toContain('Accuracy:');
    });

    await step('删除训练 pod', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 1500,
    }, async () => {
      const result = await kubectl.delete('pod', POD_NAME);
      await expect(result).toBeSuccessful();
      await sleep(5000);
    });
  });
});
