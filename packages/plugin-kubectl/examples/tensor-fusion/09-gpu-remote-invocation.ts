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

import {
  test,
  describe,
  expect,
  step,
  TIMEOUTS,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
  clientPodYaml,
  getConnectionInfoFromPod,
  deleteResourceAndWait,
  waitForCudaReady,
  waitFor,
} from './_config.js';

const CLIENT_POD_NAME = 'test-remote-client';

describe('Test Scenario 9: GPU Remote Invocation', { record: true }, () => {
  test('Client pod auto-creates TensorFusionConnection and verifies remote GPU access', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let connName: string;
    let connNamespace: string;

    await deleteResourceAndWait(kubectl, 'pod', CLIENT_POD_NAME);

    try {
      // ===== Step 1: Create client pod (webhook auto-creates workload + connection) =====
      await step(
        'Create remote-mode client pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const yaml = clientPodYaml(CLIENT_POD_NAME, { poolName: TEST_GPU_POOL });
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
        }
      );

      await step(
        'Wait for client pod Ready',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await kubectl.waitForPod(CLIENT_POD_NAME, 'Running', TIMEOUTS.POD_READY);
        }
      );

      // ===== Step 2: Check TensorFusionConnection auto-creation =====
      await step(
        'Read connection info from client pod env',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const info = await getConnectionInfoFromPod(kubectl, CLIENT_POD_NAME);
          connName = info.connName;
          connNamespace = info.connNamespace;

          expect(connName.length).toBeGreaterThan(0);
          expect(connNamespace.length).toBeGreaterThan(0);
        }
      );

      await step(
        'Verify TensorFusionConnection resource exists',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const exists = await kubectl.exists('tensorfusionconnection', connName);
          expect(exists).toBe(true);
        }
      );

      // ===== Step 3: Verify connection metadata =====
      await step(
        'Verify connection metadata fields',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const metadata = await kubectl.get<{
            namespace: string;
            workloadLabel: string;
            ownerKind: string;
            ownerName: string;
          }>('tensorfusionconnection', connName, {
            jqFilter: `{namespace: .metadata.namespace, workloadLabel: .metadata.labels["tensor-fusion.ai/workload"], ownerKind: .metadata.ownerReferences[0].kind, ownerName: .metadata.ownerReferences[0].name}`,
          });

          // metadata.namespace should match test namespace
          expect(metadata?.namespace).toBe(TEST_NAMESPACE);

          // ownerReferences should point to client pod
          expect(metadata?.ownerKind).toBe('Pod');
          expect(metadata?.ownerName).toBe(CLIENT_POD_NAME);
        }
      );

      // ===== Step 4: Verify connection spec =====
      await step(
        'Verify connection spec fields',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const spec = await kubectl.getJsonPath<{
            workloadName?: string;
            clientPod?: string;
          }>('tensorfusionconnection', connName, '.spec');

          expect(spec?.clientPod).toBe(CLIENT_POD_NAME);
        }
      );

      // ===== Step 5: Check connection status =====
      await step(
        'Check connection status',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const status = await kubectl.getJsonPath<{
            phase?: string;
            workerName?: string;
            connectionURL?: string;
          }>('tensorfusionconnection', connName, '.status');

          // phase should exist
          expect(status?.phase).toBeDefined();
        }
      );

      // ===== Step 6: Verify GPU access inside client pod =====
      // In remote mode, TF client injects libadd_path.so via LD_PRELOAD to modify PATH.
      // Commands must be wrapped with sh -c for LD_PRELOAD to take effect.
      await step(
        'Run nvidia-smi to verify GPU visibility',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const nvidiaSmiOutput = await waitFor(
            () => kubectl.exec(CLIENT_POD_NAME, ['sh', '-c', 'nvidia-smi'], { container: 'app' }),
            (output) => output.includes('NVIDIA') && output.includes('GPU'),
            { timeoutMs: TIMEOUTS.POD_READY, intervalMs: 5000, description: 'nvidia-smi shows GPU' }
          );

          expect(nvidiaSmiOutput).toContain('NVIDIA');
          expect(nvidiaSmiOutput).toContain('GPU');
        }
      );

      await step(
        'Run nvidia-smi -L to list GPU devices',
        {
          typingSpeed: 80,
          pauseAfter: 2000,
        },
        async () => {
          const gpuListOutput = await kubectl.exec(CLIENT_POD_NAME, ['sh', '-c', 'nvidia-smi -L'], {
            container: 'app',
          });

          // At least one GPU should be present
          expect(gpuListOutput).toContain('GPU 0');
        }
      );

      await step(
        'Verify CUDA availability via PyTorch',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          await waitForCudaReady(kubectl, CLIENT_POD_NAME, 'app');
        }
      );

      await step(
        'Get GPU device info via PyTorch',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const gpuInfo = await kubectl.exec(
            CLIENT_POD_NAME,
            [
              'sh',
              '-c',
              'python3 -c "import torch; print(f\'device_count={torch.cuda.device_count()}, name={torch.cuda.get_device_name(0)}\')"',
            ],
            { container: 'app' }
          );

          // At least 1 GPU should be available
          expect(gpuInfo).toContain('device_count=');
          expect(gpuInfo).not.toContain('device_count=0');
        }
      );

      await step(
        'Verify GPU tensor operations via PyTorch',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 3000,
        },
        async () => {
          const tensorTest = await kubectl.exec(
            CLIENT_POD_NAME,
            [
              'sh',
              '-c',
              "python3 -c \"import torch; a = torch.randn(2, 3, device='cuda'); b = torch.randn(3, 2, device='cuda'); c = torch.mm(a, b); print(f'shape={list(c.shape)}, device={c.device}')\"",
            ],
            { container: 'app' }
          );

          // Verify computation completed on GPU
          expect(tensorTest).toContain('shape=[2, 2]');
          expect(tensorTest).toContain('device=cuda');
        }
      );

      // ===== Step 7: Cleanup =====
      await step(
        'Delete client pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          const result = await kubectl.delete('pod', CLIENT_POD_NAME);
          await expect(result).toBeSuccessful();

          await Bun.sleep(5000);
        }
      );
    } finally {
      await deleteResourceAndWait(kubectl, 'pod', CLIENT_POD_NAME);
    }
  });
});
