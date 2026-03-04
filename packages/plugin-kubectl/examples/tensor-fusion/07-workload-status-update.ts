/**
 * Test Scenario 7: Workload Status Update (PDF 2.9 + 2.11)
 *
 * Verify TensorFusionWorkload status fields:
 * - workerCount and readyWorkers match requested replicas
 * - phase is Running when all workers are ready
 * - Controller recreates pods after manual deletion
 * - Status recovers to Running after pod recreation
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/07-workload-status-update.ts
 */

import {
  test,
  describe,
  expect,
  step,
  workloadYaml,
  TIMEOUTS,
  getWorkerPodNames,
  deleteResourceAndWait,
  waitFor,
} from './_config.js';

const WORKLOAD_NAME = 'test-status-update';

describe(
  'Test Scenario 7: Workload Status Update',
  { record: true },
  () => {
    test('Workload status fields update correctly through lifecycle', async (ctx) => {
      const { kubectl } = ctx.plugins;
      let workloadCreated = false;

      await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

      try {
        // ===== Step 1: Create workload with 2 replicas =====
        await step(
          'Create TensorFusionWorkload with 2 replicas',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const yaml = workloadYaml(WORKLOAD_NAME, { replicas: 2 });
            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
            workloadCreated = true;
          }
        );

        // ===== Step 2: Wait for Ready =====
        await step(
          'Wait for Workload Ready',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const result = await kubectl.wait('tensorfusionworkload', WORKLOAD_NAME, 'Ready', {
              timeout: TIMEOUTS.LONG,
            });
            await expect(result).toBeSuccessful();
          }
        );

        // ===== Step 3: Verify status fields =====
        await step(
          'Verify workerCount and readyWorkers',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const status = await kubectl.getJsonPath<{
              phase?: string;
              workerCount?: number;
              readyWorkers?: number;
            }>('tensorfusionworkload', WORKLOAD_NAME, '.status');

            expect(status?.phase).toBe('Running');
            expect(status?.workerCount).toBe(2);
            expect(status?.readyWorkers).toBe(2);
          }
        );

        // ===== Step 4: Verify worker pod count =====
        await step(
          'Verify 2 worker pods exist',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const podNames = await getWorkerPodNames(kubectl, WORKLOAD_NAME);
            expect(podNames.length).toBe(2);
          }
        );

        // ===== Step 5: Delete one worker pod =====
        await step(
          'Delete one worker pod',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 3000,
          },
          async () => {
            const podNames = await getWorkerPodNames(kubectl, WORKLOAD_NAME);
            const result = await kubectl.delete('pod', podNames[0]);
            await expect(result).toBeSuccessful();
          }
        );

        // ===== Step 6: Wait for controller to recreate =====
        await step(
          'Wait for controller to recreate pod',
          {
            typingSpeed: 0,
            pauseAfter: 2500,
          },
          async () => {
            await waitFor(
              () => kubectl.getJsonPath<{ workerCount?: number; readyWorkers?: number }>('tensorfusionworkload', WORKLOAD_NAME, '.status'),
              (status) => status?.workerCount === 2 && status?.readyWorkers === 2,
              { timeoutMs: TIMEOUTS.LONG, description: 'controller recreates pod' }
            );

            const podNames = await getWorkerPodNames(kubectl, WORKLOAD_NAME);
            expect(podNames.length).toBe(2);
          }
        );

        // ===== Step 7: Verify final status =====
        await step(
          'Verify final status is Running',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const status = await kubectl.getJsonPath<{
              phase?: string;
              workerCount?: number;
              readyWorkers?: number;
            }>('tensorfusionworkload', WORKLOAD_NAME, '.status');

            expect(status?.phase).toBe('Running');
            expect(status?.workerCount).toBe(2);
            expect(status?.readyWorkers).toBe(2);
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
