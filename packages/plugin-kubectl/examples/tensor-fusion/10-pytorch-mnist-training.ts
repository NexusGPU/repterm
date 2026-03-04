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
  TIMEOUTS,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
  PYTORCH_IMAGE,
  deleteResourceAndWait,
  waitForCudaReady,
} from './_config.js';

const POD_NAME = 'test-mnist-training';

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

describe('Test Scenario 10: PyTorch MNIST Training', { record: true }, () => {
  test('Execute MNIST training and verify results with remote GPU', { timeout: TIMEOUTS.INFERENCE }, async (ctx) => {
    const { kubectl } = ctx.plugins;

    // Clean up pod from previous run (pod spec is immutable; must delete before re-apply)
    await deleteResourceAndWait(kubectl, 'pod', POD_NAME);

    try {
      await step(
        'Create MNIST training pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const yaml = podYaml(POD_NAME, TEST_GPU_POOL);
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
        }
      );

      await step(
        'Wait for pod Ready',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await kubectl.waitForPod(POD_NAME, 'Running', TIMEOUTS.POD_READY);
        }
      );

      await step(
        'Verify remote GPU available',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          await waitForCudaReady(kubectl, POD_NAME, 'python');
        }
      );

      await step(
        'Get GPU device info',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const gpuInfo = await kubectl.exec(
            POD_NAME,
            [
              'sh',
              '-c',
              'python3 -c "import torch; print(f\'device_count={torch.cuda.device_count()}, name={torch.cuda.get_device_name(0)}\')"',
            ],
            { container: 'python' }
          );
          expect(gpuInfo).toContain('device_count=');
          expect(gpuInfo).not.toContain('device_count=0');
        }
      );

      await step(
        'Run MNIST training (dry-run, 1 epoch)',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 3000,
        },
        async () => {
          const output = await kubectl.exec(
            POD_NAME,
            ['sh', '-c', 'cd /workspace && python3 /workspace/Demo/mnist.py --dry-run --epochs 1'],
            { container: 'python', timeout: TIMEOUTS.INFERENCE }
          );

          // Verify training output contains epoch and loss
          expect(output).toContain('Train Epoch: 1');
          expect(output).toContain('Loss:');
          // Verify test set evaluation output
          expect(output).toContain('Test set:');
          expect(output).toContain('Accuracy:');
        }
      );

      await step(
        'Delete training pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          const result = await kubectl.delete('pod', POD_NAME);
          await expect(result).toBeSuccessful();
          await sleep(5000);
        }
      );
    } finally {
      await deleteResourceAndWait(kubectl, 'pod', POD_NAME);
    }
  });
});
