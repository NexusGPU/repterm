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

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  tensorfusionworkload,
  workloadYaml,
  DEFAULT_TIMEOUT,
  type KubectlMethods,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-replicas';

/**
 * Get the number of worker pods for a given workload
 */
async function getWorkerPodCount(kubectl: KubectlMethods, workloadName: string): Promise<number> {
  const pods = await kubectl.get<Array<{ name: string; phase: string }>>('pod', undefined, {
    selector: `tensor-fusion.ai/workload=${workloadName},tensor-fusion.ai/component=worker`,
    jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]',
  });

  return pods?.length ?? 0;
}

describe('Test Scenario 8: Workload Replicas Scale Up/Down', { record: true }, () => {
  test('TensorFusionWorkload worker pods and workerCount sync update after scale up/down', async (ctx) => {
    const { kubectl } = ctx.plugins;
    // ===== Step 1: Create replicas=1 Workload and wait for ready =====
    await step('Create Workload (replicas=1)', {
      showStepTitle: false,
      typingSpeed: 100,
      pauseAfter: 2000,
    }, async () => {
      const yaml = workloadYaml(WORKLOAD_NAME, {
        tflopsRequest: '1000m',
        tflopsLimit: '2000m',
        vramRequest: '1Gi',
        vramLimit: '2Gi',
        replicas: 1,
      });

      const result = await kubectl.apply(yaml);
      await expect(result).toBeSuccessful();
    });

    await step('Wait for Workload Ready', {
      showStepTitle: false,
      pauseAfter: 1800,
    }, async () => {
      const waitResult = await kubectl.wait(
        'tensorfusionworkload',
        WORKLOAD_NAME,
        'Ready',
        { timeout: DEFAULT_TIMEOUT },
      );
      await expect(waitResult).toBeSuccessful();

      const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
      await expect(workload).toHaveStatusField('phase', 'Running');
    });

    // ===== Step 2: Record current worker pod count =====
    await step('Record current worker pod count', {
      typingSpeed: 80,
      pauseAfter: 1500,
    }, async () => {
      const beforeCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

      expect(beforeCount).toBe(1);

      // Verify status.workerCount is also 1
      const status = await kubectl.getJsonPath<{ workerCount?: number }>(
        'tensorfusionworkload', WORKLOAD_NAME, '.status',
      );
      expect(status?.workerCount).toBe(1);
    });

    // ===== Step 3: Scale up replicas to 2 =====
    await step('patch Workload replicas=2', {
      showStepTitle: false,
      typingSpeed: 100,
      pauseAfter: 1800,
    }, async () => {
      const patchResult = await kubectl.patch(
        'tensorfusionworkload',
        WORKLOAD_NAME,
        { spec: { replicas: 2 } },
        'merge',
      );
      await expect(patchResult).toBeSuccessful();

      // Confirm spec.replicas has been updated
      const replicas = await kubectl.getJsonPath<number>(
        'tensorfusionworkload', WORKLOAD_NAME, '.spec.replicas',
      );
      expect(replicas).toBe(2);
    });

    // ===== Step 4: Verify scale-up results =====
    await step('Wait for workerCount=2', {
      showStepTitle: false,
      pauseAfter: 2000,
    }, async () => {
      const deadline = Date.now() + DEFAULT_TIMEOUT;

      while (Date.now() < deadline) {
        const status = await kubectl.getJsonPath<{ workerCount?: number }>(
          'tensorfusionworkload', WORKLOAD_NAME, '.status',
        );

        if (status?.workerCount === 2) {
          break;
        }

        await sleep(3000);
      }

      const status = await kubectl.getJsonPath<{ workerCount?: number }>(
        'tensorfusionworkload', WORKLOAD_NAME, '.status',
      );
      expect(status?.workerCount).toBe(2);
    });

    await step('Verify worker pod count is 2 after scale-up', {
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const afterScaleUpCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

      expect(afterScaleUpCount).toBe(2);
    });

    // ===== Step 5: Scale down replicas to 1 =====
    await step('patch Workload replicas=1', {
      showStepTitle: false,
      typingSpeed: 100,
      pauseAfter: 1800,
    }, async () => {
      const patchResult = await kubectl.patch(
        'tensorfusionworkload',
        WORKLOAD_NAME,
        { spec: { replicas: 1 } },
        'merge',
      );
      await expect(patchResult).toBeSuccessful();
    });

    await step('Wait for workerCount=1', {
      showStepTitle: false,
      pauseAfter: 2000,
    }, async () => {
      const deadline = Date.now() + DEFAULT_TIMEOUT;

      while (Date.now() < deadline) {
        const status = await kubectl.getJsonPath<{ workerCount?: number }>(
          'tensorfusionworkload', WORKLOAD_NAME, '.status',
        );

        if (status?.workerCount === 1) {
          break;
        }

        await sleep(3000);
      }

      const status = await kubectl.getJsonPath<{ workerCount?: number }>(
        'tensorfusionworkload', WORKLOAD_NAME, '.status',
      );
      expect(status?.workerCount).toBe(1);
    });

    await step('Verify worker pod count is 1 after scale-down', {
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const afterScaleDownCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

      expect(afterScaleDownCount).toBe(1);
    });

    // ===== Step 6: Cleanup =====
    await step('Delete TensorFusionWorkload', {
      showStepTitle: false,
      typingSpeed: 80,
      pauseAfter: 2000,
    }, async () => {
      const deleteResult = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
      await expect(deleteResult).toBeSuccessful();

      await sleep(5000);
    });
  });
});
