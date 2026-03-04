/**
 * Test Scenario 1: Normal Resource Allocation - Using TensorFusionWorkload
 *
 * Verify that by creating a TensorFusionWorkload:
 * - GPU resources are correctly allocated
 * - Workload status changes to Running
 * - GPU available resources decrease correctly
 * - Worker Pod contains correct annotations
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/01-workload-allocation.ts
 */

import {
  test,
  describe,
  expect,
  step,
  tensorfusionworkload,
  workloadYaml,
  DEFAULT_TIMEOUT,
  getFirstGpuName,
  deleteResourceAndWait,
  waitFor,
  getWorkerPodNames,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-alloc';

describe(
  'Test Scenario 1: Normal Resource Allocation - TensorFusionWorkload',
  { record: true },
  () => {
    test('TensorFusionWorkload resource allocation complete flow', async (ctx) => {
      const { kubectl } = ctx.plugins;
      let gpuName: string;
      let workloadCreated = false;

      // Clean up stale workload from previous run
      await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

      try {
        // ===== Step 1: Record initial state =====
        await step(
          'Acquire test GPU',
          {
            showStepTitle: false,
            typingSpeed: 0, // Fast execution during preparation phase
            pauseAfter: 1000,
          },
          async () => {
            gpuName = await getFirstGpuName(kubectl);
          }
        );

        // ===== Step 2: Create resource (core operation) =====
        await step(
          'Create Workload',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 3000,
          },
          async () => {
            const yaml = workloadYaml(WORKLOAD_NAME, {
              tflopsRequest: '1000m',
              tflopsLimit: '2000m',
              vramRequest: '1Gi',
              vramLimit: '2Gi',
              isLocalGPU: false,
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
            workloadCreated = true;
          }
        );

        // ===== Step 3: Wait for Workload ready =====
        await step(
          'Wait for Ready condition',
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

        await step(
          'Verify Workload status is Running',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
            await expect(workload).toHaveStatusField('phase', 'Running');
          }
        );

        // ===== Step 4: Verify resource allocation results =====
        await step(
          'Check GPU available resources change',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2500, // Verification results need reading time
          },
          async () => {
            // Pool-level tflops is unreliable in parallel execution (other tests
            // consume/release resources concurrently). Verify our workload appears
            // in GPU's runningApps — a per-workload deterministic check.
            await waitFor(
              () => kubectl.getJsonPath<Array<{ namespace?: string; name?: string }>>('gpu', gpuName, '.status.runningApps'),
              (runningApps) => (runningApps ?? []).map((app) => `${app.namespace}/${app.name}`).includes(`default/${WORKLOAD_NAME}`),
              { description: 'workload appears in GPU runningApps' }
            );
          }
        );

        await step(
          'Verify Workload readyWorkers',
          {
            typingSpeed: 0,
            pauseAfter: 1500,
          },
          async () => {
            const status = await kubectl.getJsonPath<{
              phase?: string;
              readyWorkers?: number;
            }>('tensorfusionworkload', WORKLOAD_NAME, '.status');

            expect(status?.phase).toBe('Running');
            expect(status?.readyWorkers).toBe(1);
          }
        );

        // ===== Step 5: Verify Worker Pod =====
        await step(
          'Find and verify Worker Pod',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const pods = await kubectl.get<
              Array<{
                name: string;
                phase: string;
                annotations: Record<string, string>;
              }>
            >('pod', undefined, {
              selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME}`,
              jqFilter:
                '[.items[] | {name: .metadata.name, phase: .status.phase, annotations: .metadata.annotations}]',
            });

            expect(pods?.length).toBeGreaterThan(0);

            const workerPod = pods[0];
            expect(workerPod.phase).toBe('Running');

            // Verify annotations exist
            const annotations = workerPod.annotations ?? {};
            expect(annotations['tensor-fusion.ai/tflops-request']).toBeDefined();
            expect(annotations['tensor-fusion.ai/vram-request']).toBeDefined();
          }
        );

        // ===== Cleanup =====
        await step(
          'Delete TensorFusionWorkload',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 6000,
          },
          async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
          }
        );

        await step(
          'Wait for resource release and verify',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            // Wait for worker pods to be fully gone (direct proof of resource release)
            await waitFor(
              () => kubectl.get<Array<{ name: string }>>('pod', undefined, {
                selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME},tensor-fusion.ai/component=worker`,
                jqFilter:
                  '[.items[] | select(.metadata.deletionTimestamp == null) | {name: .metadata.name}]',
              }),
              (pods) => (pods?.length ?? 0) === 0,
              { description: 'worker pods fully removed' }
            );
          }
        );
      } finally {
        // Ensure workload is cleaned up even if assertions fail
        if (workloadCreated) {
          await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
        }
      }
    });
  }
);
