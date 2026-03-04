/**
 * Test Scenario 4: Pod OwnerReference Verification (PDF 2.8)
 *
 * Verify that worker pods created by TensorFusionWorkload have correct ownerReferences:
 * - ownerReference kind is TensorFusionWorkload
 * - ownerReference name matches workload name
 * - ownerReference apiVersion is tensor-fusion.ai/v1
 * - controller flag is true
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/04-pod-owner-reference.ts
 */

import {
  test,
  describe,
  expect,
  step,
  workloadYaml,
  DEFAULT_TIMEOUT,
  getWorkerPodNames,
  deleteResourceAndWait,
} from './_config.js';

const WORKLOAD_NAME = 'test-owner-ref';

describe(
  'Test Scenario 4: Pod OwnerReference Verification',
  { record: true },
  () => {
    test('Worker pod ownerReferences correctly point to TensorFusionWorkload', async (ctx) => {
      const { kubectl } = ctx.plugins;
      let workloadCreated = false;

      await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

      try {
        // ===== Step 1: Create workload =====
        await step(
          'Create TensorFusionWorkload',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const yaml = workloadYaml(WORKLOAD_NAME);
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
              timeout: DEFAULT_TIMEOUT,
            });
            await expect(result).toBeSuccessful();
          }
        );

        // ===== Step 3: Get worker pod =====
        await step(
          'Find worker pod',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const podNames = await getWorkerPodNames(kubectl, WORKLOAD_NAME);
            expect(podNames.length).toBeGreaterThan(0);
          }
        );

        // ===== Step 4: Verify ownerReferences =====
        await step(
          'Verify worker pod ownerReferences',
          {
            typingSpeed: 0,
            pauseAfter: 2500,
          },
          async () => {
            const podNames = await getWorkerPodNames(kubectl, WORKLOAD_NAME);
            const podName = podNames[0];

            const ownerRef = await kubectl.get<{
              kind: string;
              name: string;
              apiVersion: string;
              controller: boolean;
              blockOwnerDeletion: boolean;
            }>('pod', podName, {
              jqFilter: '.metadata.ownerReferences[0]',
            });

            expect(ownerRef?.kind).toBe('TensorFusionWorkload');
            expect(ownerRef?.name).toBe(WORKLOAD_NAME);
            expect(ownerRef?.apiVersion).toBe('tensor-fusion.ai/v1');
            expect(ownerRef?.controller).toBe(true);
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
