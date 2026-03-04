/**
 * Test Scenario 13: Workload Deletion and Resource Cleanup (PDF 2.12)
 *
 * Verify that deleting a TensorFusionWorkload:
 * - Worker pods are cleaned up
 * - GPU available resources recover
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/13-workload-deletion-cleanup.ts
 */

import {
  test,
  describe,
  expect,
  step,
  workloadYaml,
  DEFAULT_TIMEOUT,
  getFirstGpuName,
  getGpuAvailable,
  getWorkerPodNames,
  parseTflops,
  deleteResourceAndWait,
  waitFor,
} from './_config.js';

const WORKLOAD_NAME = 'test-deletion-cleanup';

describe('Test Scenario 13: Workload Deletion and Resource Cleanup', { record: true }, () => {
  test('Workload deletion cleans up pods and releases GPU resources', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let gpuName: string;
    let initialTflops: number;
    let workloadCreated = false;

    await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

    try {
      // ===== Step 1: Record initial GPU state =====
      await step(
        'Record initial GPU state',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          gpuName = await getFirstGpuName(kubectl);
          const available = await getGpuAvailable(kubectl, gpuName);
          initialTflops = parseTflops(available.tflops);
        }
      );

      // ===== Step 2: Create workload =====
      await step(
        'Create TensorFusionWorkload',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const yaml = workloadYaml(WORKLOAD_NAME, {
            tflopsRequest: '1000m',
            tflopsLimit: '2000m',
            vramRequest: '1Gi',
            vramLimit: '2Gi',
          });
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
          workloadCreated = true;
        }
      );

      // ===== Step 3: Wait for Ready =====
      await step(
        'Wait for Workload Ready',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const result = await kubectl.wait('tensorfusionworkload', WORKLOAD_NAME, 'Ready', {
            timeout: DEFAULT_TIMEOUT,
          });
          await expect(result).toBeSuccessful();
        }
      );

      // ===== Step 4: Delete workload =====
      await step(
        'Delete TensorFusionWorkload',
        {
          typingSpeed: 0,
          pauseAfter: 3000,
        },
        async () => {
          const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
          await expect(result).toBeSuccessful();

          await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME, {
            timeoutMs: DEFAULT_TIMEOUT,
            throwOnTimeout: true,
          });

          workloadCreated = false;
        }
      );

      // ===== Step 5: Verify worker pods cleaned up =====
      await step(
        'Verify worker pods are deleted',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          await waitFor(
            () => getWorkerPodNames(kubectl, WORKLOAD_NAME),
            (names) => names.length === 0,
            { description: 'worker pods are deleted' }
          );
        }
      );

      // ===== Step 6: Verify GPU resources recovered =====
      await step(
        'Verify GPU available resources recovered',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await waitFor(
            () => getGpuAvailable(kubectl, gpuName),
            (available) => parseTflops(available.tflops) >= initialTflops,
            { description: 'GPU available resources recovered' }
          );
        }
      );
    } finally {
      if (workloadCreated) {
        await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
      }
    }
  });
});
