/**
 * Test Scenario 8: Workload Replicas Scale Up/Down
 *
 * Based on `WorkloadReplicas_Scale_Test.md`:
 * - First create replicas=1 TensorFusionWorkload and wait for ready
 * - Scale replicas from 1 to 2, verify worker pods increase and status.workerCount=2
 * - Scale replicas from 2 back to 1, verify worker pods decrease and status.workerCount=1
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/08-workload-replicas-scale.ts
 */

import {
  test,
  describe,
  expect,
  step,
  tensorfusionworkload,
  workloadYaml,
  DEFAULT_TIMEOUT,
  getWorkerPodCount,
  waitFor,
  deleteResourceAndWait,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-replicas';

describe('Test Scenario 8: Workload Replicas Scale Up/Down', { record: true }, () => {
  test('TensorFusionWorkload worker pods and workerCount sync update after scale up/down', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let workloadCreated = false;

    // Clean up stale workload from previous run
    await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

    try {
      // ===== Step 1: Create replicas=1 Workload and wait for ready =====
      await step(
        'Create Workload (replicas=1)',
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
            replicas: 1,
          });

          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
          workloadCreated = true;
        }
      );

      await step(
        'Wait for Workload Ready',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1800,
        },
        async () => {
          const waitResult = await kubectl.wait('tensorfusionworkload', WORKLOAD_NAME, 'Ready', {
            timeout: DEFAULT_TIMEOUT,
          });
          await expect(waitResult).toBeSuccessful();

          const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
          await expect(workload).toHaveStatusField('phase', 'Running');
        }
      );

      // ===== Step 2: Record current worker pod count =====
      await step(
        'Record current worker pod count',
        {
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          const beforeCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

          expect(beforeCount).toBe(1);

          // Verify status.workerCount is also 1
          const status = await kubectl.getJsonPath<{ workerCount?: number }>(
            'tensorfusionworkload',
            WORKLOAD_NAME,
            '.status'
          );
          expect(status?.workerCount).toBe(1);
        }
      );

      // ===== Step 3: Scale up replicas to 2 =====
      await step(
        'patch Workload replicas=2',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1800,
        },
        async () => {
          const patchResult = await kubectl.patch(
            'tensorfusionworkload',
            WORKLOAD_NAME,
            { spec: { replicas: 2 } },
            'merge'
          );
          await expect(patchResult).toBeSuccessful();

          // Confirm spec.replicas has been updated
          const replicas = await kubectl.getJsonPath<number>(
            'tensorfusionworkload',
            WORKLOAD_NAME,
            '.spec.replicas'
          );
          expect(replicas).toBe(2);
        }
      );

      // ===== Step 4: Verify scale-up results =====
      await step(
        'Wait for workerCount=2',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await waitFor(
            () => kubectl.getJsonPath<{ workerCount?: number }>('tensorfusionworkload', WORKLOAD_NAME, '.status'),
            (status) => status?.workerCount === 2,
            { description: 'workerCount reaches 2' }
          );
        }
      );

      await step(
        'Verify worker pod count is 2 after scale-up',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          // Pod count may briefly be >2 during transition (old pod terminating).
          // Poll until it stabilizes at expected count.
          await waitFor(
            () => getWorkerPodCount(kubectl, WORKLOAD_NAME),
            (count) => count === 2,
            { description: 'worker pod count stabilizes at 2' }
          );
        }
      );

      // ===== Step 5: Scale down replicas to 1 =====
      await step(
        'patch Workload replicas=1',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1800,
        },
        async () => {
          const patchResult = await kubectl.patch(
            'tensorfusionworkload',
            WORKLOAD_NAME,
            { spec: { replicas: 1 } },
            'merge'
          );
          await expect(patchResult).toBeSuccessful();
        }
      );

      await step(
        'Wait for workerCount=1',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await waitFor(
            () => kubectl.getJsonPath<{ workerCount?: number }>('tensorfusionworkload', WORKLOAD_NAME, '.status'),
            (status) => status?.workerCount === 1,
            { description: 'workerCount reaches 1' }
          );
        }
      );

      await step(
        'Verify worker pod count is 1 after scale-down',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          await waitFor(
            () => getWorkerPodCount(kubectl, WORKLOAD_NAME),
            (count) => count === 1,
            { description: 'worker pod count stabilizes at 1' }
          );
        }
      );

      // ===== Step 6: Cleanup =====
      await step(
        'Delete TensorFusionWorkload',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const deleteResult = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
          await expect(deleteResult).toBeSuccessful();

          await Bun.sleep(5000);
        }
      );
    } finally {
      // Ensure workload is cleaned up even if assertions fail
      if (workloadCreated) {
        await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
      }
    }
  });
});
