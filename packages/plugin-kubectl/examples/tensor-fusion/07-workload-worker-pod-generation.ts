/**
 * Test Scenario 7: Workload Creation and Worker Pod Generation
 *
 * Based on `Workload_Creation_and_WorkerPod_Generation_Test.md`:
 * - Create `replicas=2` TensorFusionWorkload
 * - Wait for `status.workerCount` to become 2
 * - Wait for worker Pods to be Ready
 * - Verify worker Pod count matches `spec.replicas`
 * - Verify `status.workerCount` is updated correctly
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/07-workload-worker-pod-generation.ts
 */

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  tensorfusionworkload,
  TEST_NAMESPACE,
  TEST_GPU_POOL,
  type KubectlMethods,
} from './_config.js';

const WORKLOAD_NAME = 'tf-workload-worker-count-test';
const EXPECTED_REPLICAS = 2;
const WAIT_TIMEOUT = 180000;
const POLL_INTERVAL = 1500;

function workloadWorkerCountYaml(name: string, poolName: string): string {
  return `
apiVersion: tensor-fusion.ai/v1
kind: TensorFusionWorkload
metadata:
  name: ${name}
  namespace: ${TEST_NAMESPACE}
  labels:
    app: ${name}
    test-type: worker-count
spec:
  replicas: ${EXPECTED_REPLICAS}
  gpuCount: 1
  poolName: ${poolName}
  qos: medium
  isolation: soft
  isLocalGPU: false
  resources:
    requests:
      tflops: "100m"
      vram: "1Gi"
    limits:
      tflops: "100m"
      vram: "1Gi"
`;
}

async function listWorkerPods(
  kubectl: KubectlMethods,
  workloadName: string
): Promise<Array<{ name: string; phase?: string }>> {
  const strictSelector = `tensor-fusion.ai/workload=${workloadName},tensor-fusion.ai/component=worker`;
  const fallbackSelector = `tensor-fusion.ai/workload=${workloadName}`;

  const workerPods = await kubectl.get<Array<{ name: string; phase?: string }>>('pod', undefined, {
    selector: strictSelector,
    jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]',
  });

  if (Array.isArray(workerPods) && workerPods.length > 0) {
    return workerPods;
  }

  const fallbackPods = await kubectl.get<Array<{ name: string; phase?: string }>>(
    'pod',
    undefined,
    {
      selector: fallbackSelector,
      jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]',
    }
  );

  return fallbackPods ?? [];
}

async function waitForWorkerPods(
  kubectl: KubectlMethods,
  workloadName: string,
  expectedCount: number,
  timeoutMs: number
): Promise<Array<{ name: string; phase?: string }>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const workerPods = await listWorkerPods(kubectl, workloadName);
    if (workerPods.length >= expectedCount) {
      return workerPods;
    }
    await sleep(POLL_INTERVAL);
  }

  throw new Error(`Timeout waiting worker pods for ${workloadName} reach ${expectedCount}`);
}

describe('Test Scenario 7: Workload Creation and Worker Pod Generation', { record: true }, () => {
  test('Create replicas=2 Workload and generate corresponding worker Pods', async (ctx) => {
    const { kubectl } = ctx.plugins;

    try {
      await step(
        'Create TensorFusionWorkload (replicas=2)',
        {
          showStepTitle: false,
          typingSpeed: 90,
          pauseAfter: 1800,
        },
        async () => {
          const yaml = workloadWorkerCountYaml(WORKLOAD_NAME, TEST_GPU_POOL);
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();

          const specReplicas = await kubectl.getJsonPath<number>(
            'tensorfusionworkload',
            WORKLOAD_NAME,
            '.spec.replicas'
          );

          expect(specReplicas).toBe(EXPECTED_REPLICAS);
        }
      );

      await step(
        'Wait for Workload status.workerCount=2',
        {
          showStepTitle: false,
          pauseAfter: 1800,
        },
        async () => {
          await kubectl.waitForJsonPath(
            'tensorfusionworkload',
            WORKLOAD_NAME,
            '.status.workerCount',
            String(EXPECTED_REPLICAS),
            WAIT_TIMEOUT
          );

          const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
          await expect(workload).toHaveStatusField('workerCount', EXPECTED_REPLICAS);
        }
      );

      await step(
        'Wait for worker Pods to be created and Ready',
        {
          showStepTitle: false,
          typingSpeed: 80,
          pauseAfter: 2000,
        },
        async () => {
          const workerPods = await waitForWorkerPods(
            kubectl,
            WORKLOAD_NAME,
            EXPECTED_REPLICAS,
            WAIT_TIMEOUT
          );

          for (const podInfo of workerPods.slice(0, EXPECTED_REPLICAS)) {
            const waitResult = await kubectl.wait('pod', podInfo.name, 'Ready', {
              timeout: WAIT_TIMEOUT,
            });
            await expect(waitResult).toBeSuccessful();
          }
        }
      );

      await step(
        'Verify worker Pod count matches replicas',
        {
          typingSpeed: 80,
          pauseAfter: 1800,
        },
        async () => {
          const expectedReplicas =
            (await kubectl.getJsonPath<number>(
              'tensorfusionworkload',
              WORKLOAD_NAME,
              '.spec.replicas'
            )) ?? 0;

          const workerPods = await listWorkerPods(kubectl, WORKLOAD_NAME);
          const actualWorkerCount = workerPods.length;

          expect(actualWorkerCount).toBe(expectedReplicas);
        }
      );

      await step(
        'Verify status.workerCount matches replicas',
        {
          showStepTitle: false,
          pauseAfter: 1500,
        },
        async () => {
          const statusWorkerCount =
            (await kubectl.getJsonPath<number>(
              'tensorfusionworkload',
              WORKLOAD_NAME,
              '.status.workerCount'
            )) ?? 0;
          expect(statusWorkerCount).toBe(EXPECTED_REPLICAS);
        }
      );
    } finally {
      await step(
        'Clean up TensorFusionWorkload',
        {
          showStepTitle: false,
          typingSpeed: 70,
          pauseAfter: 1200,
        },
        async () => {
          try {
            const exists = await kubectl.exists('tensorfusionworkload', WORKLOAD_NAME);
            if (!exists) {
              return;
            }

            const deleteResult = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(deleteResult).toBeSuccessful();
          } catch {
            // Cleanup failure does not override main assertion error
          }
        }
      );
    }
  });
});
