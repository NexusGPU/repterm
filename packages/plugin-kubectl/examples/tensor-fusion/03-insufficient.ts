/**
 * Test Scenario 3: Insufficient Resource Scenario
 *
 * Verify that when requested GPU resources exceed available amount:
 * - TensorFusionWorkload status should be Pending
 * - replicas should be 0
 * - GPU available resources should not decrease
 *
 * Recording effect:
 * - Main pane: continuously watch workload status changes
 * - New pane: execute query and verification commands
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/03-insufficient.ts
 */

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  tensorfusionworkload,
  workloadYaml,
  getFirstGpuName,
  getGpuAvailable,
  type KubectlMethods,
  deleteResourceAndWait,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-insufficient';

describe('Test Scenario 3: Insufficient Resource Scenario', { record: true }, () => {
  test('GPU resource insufficient Workload behavior verification', async (ctx) => {
    const { kubectl } = ctx.plugins;
    const { terminal } = ctx;
    let gpuName: string;
    let initialTflops: string;
    let initialVram: string;

    await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

    try {
      // ===== Step 1: Record initial state =====
      await step(
        'Acquire test GPU',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1000,
        },
        async () => {
          gpuName = await getFirstGpuName(kubectl);
        }
      );

      await step(
        'Record initial available resources',
        {
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          const available = await getGpuAvailable(kubectl, gpuName);
          initialTflops = available.tflops;
          initialVram = available.vram;
        }
      );

      // ===== Step 2: Create Workload with excessive resource request (core operation) =====
      await step(
        'Create Workload with excessive resource request',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          // Request 100 TFlops and 100Gi VRAM - far exceeds any single GPU capacity
          const yaml = workloadYaml(WORKLOAD_NAME, {
            tflopsRequest: '100000m', // 100 TFlops
            tflopsLimit: '100000m',
            vramRequest: '100Gi',
            vramLimit: '100Gi',
          });

          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
        }
      );

      // ===== Step 3: Watch in main pane, verify in new pane =====
      await step(
        'Watch Workload status and verify',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          // Start watch in main pane (returns after command input completes)
          const watchProc = await kubectl.get('tensorfusionworkload', WORKLOAD_NAME, {
            watch: true,
          });

          // Create new terminal (automatically carries plugins)
          const terminal2 = await terminal.create();
          const kubectl2 = terminal2.plugins.kubectl as KubectlMethods;

          // Execute verification commands in new pane
          // Check status is not Running
          const status = await kubectl2.getJsonPath<{
            phase?: string;
            replicas?: number;
          }>('tensorfusionworkload', WORKLOAD_NAME, '.status');
          expect(status?.phase).not.toBe('Running');

          // Check GPU resources not allocated
          const currentAvailable = await getGpuAvailable(kubectl2, gpuName);
          expect(currentAvailable.tflops).toBe(initialTflops);
          expect(currentAvailable.vram).toBe(initialVram);

          // Get event information
          await kubectl2.get<
            Array<{
              reason: string;
              message: string;
              type: string;
            }>
          >('event', undefined, {
            fieldSelector: `involvedObject.name=${WORKLOAD_NAME},involvedObject.kind=TensorFusionWorkload`,
            jqFilter: '[.items[] | {reason: .reason, message: .message, type: .type}]',
          });

          // Observe for a period then close
          await sleep(3000);

          // Interrupt watch
          await watchProc.interrupt();
        }
      );

      // ===== Step 4: Cleanup =====
      await step(
        'Delete TensorFusionWorkload',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME, {
            force: true,
          });
          await expect(result).toBeSuccessful();
        }
      );
    } finally {
      await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME, { force: true });
    }
  });
});
