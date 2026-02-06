/**
 * 测试场景 7: Workload 创建和 Worker Pod 生成
 *
 * 基于 `Workload创建和WorkerPod生成测试.md`：
 * - 创建 `replicas=2` 的 TensorFusionWorkload
 * - 等待 `status.workerCount` 变为 2
 * - 等待 worker Pod Ready
 * - 验证 worker Pod 数量与 `spec.replicas` 一致
 * - 验证 `status.workerCount` 正确更新
 *
 * 运行方式:
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

describe('测试场景 7: Workload 创建和 Worker Pod 生成', { record: true }, () => {
  test('创建 replicas=2 的 Workload 后生成对应 worker Pods', async (ctx) => {
    const { kubectl } = ctx.plugins;

    try {
      await step(
        '创建 TensorFusionWorkload（replicas=2）',
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
        '等待 Workload status.workerCount=2',
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
        '等待 worker Pods 创建并 Ready',
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
        '验证 worker Pod 数量与 replicas 一致',
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
        '验证 status.workerCount 与 replicas 一致',
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
        '清理 TensorFusionWorkload',
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
            // 清理失败不覆盖主断言错误
          }
        }
      );
    }
  });
});
