/**
 * Test Scenario 14: Worker Pod Terminal Resource Release (PDF 2.6 + 2.7)
 *
 * Verify that GPU resources are released when worker pods terminate:
 * - Scale workload replicas to 0 to trigger pod termination
 * - Verify workerCount drops to 0
 * - Verify worker pods are fully removed
 * - Verify GPU available resources recover
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/14-pod-terminal-resource-release.ts
 */

import {
  test,
  describe,
  expect,
  step,
  workloadYaml,
  DEFAULT_TIMEOUT,
  TIMEOUTS,
  getFirstGpuName,
  getGpuAvailable,
  getWorkerPodNames,
  parseTflops,
  deleteResourceAndWait,
  waitFor,
} from './_config.js';

const WORKLOAD_NAME = 'test-pod-terminal';

describe(
  'Test Scenario 14: Worker Pod Terminal Resource Release',
  { record: true },
  () => {
    test('GPU resources are released when worker pods terminate via scale-down', async (ctx) => {
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

        // ===== Step 4: Verify GPU resources decreased =====
        await step(
          'Verify GPU resources decreased',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            await waitFor(
              () => getGpuAvailable(kubectl, gpuName),
              (available) => parseTflops(available.tflops) < initialTflops,
              { description: 'GPU resources decreased' }
            );
          }
        );

        // ===== Step 5: Scale down to 0 replicas =====
        await step(
          'Scale workload replicas to 0',
          {
            typingSpeed: 0,
            pauseAfter: 3000,
          },
          async () => {
            const result = await kubectl.patch(
              'tensorfusionworkload',
              WORKLOAD_NAME,
              '{"spec":{"replicas":0}}',
              'merge'
            );
            await expect(result).toBeSuccessful();
          }
        );

        // ===== Step 6: Verify workerCount drops to 0 =====
        await step(
          'Verify workerCount drops to 0',
          {
            typingSpeed: 0,
            pauseAfter: 2500,
          },
          async () => {
            await waitFor(
              () => kubectl.getJsonPath<{ workerCount?: number }>('tensorfusionworkload', WORKLOAD_NAME, '.status'),
              (status) => status?.workerCount === 0,
              { description: 'workerCount drops to 0' }
            );
          }
        );

        // ===== Step 7: Verify worker pods gone =====
        await step(
          'Verify worker pods fully removed',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            await waitFor(
              () => getWorkerPodNames(kubectl, WORKLOAD_NAME),
              (names) => names.length === 0,
              { description: 'worker pods fully removed' }
            );
          }
        );

        // ===== Step 8: Verify GPU resources recovered =====
        // Use longer timeout: if pod deletion event is missed by the controller,
        // resource recovery falls back to the 3-minute cleanup checker
        // (CleanUpCheckInterval in gpuallocator.go) + 10s sync cycle.
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
              { timeoutMs: TIMEOUTS.RESOURCE_RECOVERY, description: 'GPU available resources recovered' }
            );
          }
        );

        // ===== Cleanup =====
        await step(
          'Delete TensorFusionWorkload',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
            workloadCreated = false;
          }
        );
      } finally {
        if (workloadCreated) {
          await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
        }
      }
    });
  }
);
