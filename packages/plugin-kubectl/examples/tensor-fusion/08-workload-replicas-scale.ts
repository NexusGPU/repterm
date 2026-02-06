/**
 * 测试场景 8: Workload Replicas 扩缩容
 *
 * 基于 `WorkloadReplicas扩缩容测.md`：
 * - 先创建一个 replicas=1 的 TensorFusionWorkload 并等待就绪
 * - 将 replicas 从 1 扩容到 2，验证 worker pods 增加、status.workerCount=2
 * - 将 replicas 从 2 缩容回 1，验证 worker pods 减少、status.workerCount=1
 *
 * 运行方式:
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
 * 获取指定 workload 的 worker pod 数量
 */
async function getWorkerPodCount(kubectl: KubectlMethods, workloadName: string): Promise<number> {
  const pods = await kubectl.get<Array<{ name: string; phase: string }>>('pod', undefined, {
    selector: `tensor-fusion.ai/workload=${workloadName},tensor-fusion.ai/component=worker`,
    jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]',
  });

  return pods?.length ?? 0;
}

describe('测试场景 8: Workload Replicas 扩缩容', { record: true }, () => {
  test('TensorFusionWorkload 扩缩容后 worker pods 与 workerCount 同步更新', async (ctx) => {
    const { kubectl } = ctx.plugins;
    // ===== Step 1: 创建 replicas=1 的 Workload 并等待就绪 =====
    await step('创建 Workload（replicas=1）', {
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

    await step('等待 Workload Ready', {
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

    // ===== Step 2: 记录当前 worker pod 数量 =====
    await step('记录当前 worker pod 数量', {
      typingSpeed: 80,
      pauseAfter: 1500,
    }, async () => {
      const beforeCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

      expect(beforeCount).toBe(1);

      // 验证 status.workerCount 也为 1
      const status = await kubectl.getJsonPath<{ workerCount?: number }>(
        'tensorfusionworkload', WORKLOAD_NAME, '.status',
      );
      expect(status?.workerCount).toBe(1);
    });

    // ===== Step 3: 扩容 replicas 到 2 =====
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

      // 确认 spec.replicas 已更新
      const replicas = await kubectl.getJsonPath<number>(
        'tensorfusionworkload', WORKLOAD_NAME, '.spec.replicas',
      );
      expect(replicas).toBe(2);
    });

    // ===== Step 4: 验证扩容结果 =====
    await step('等待 workerCount=2', {
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

    await step('验证扩容后 worker pod 数量为 2', {
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const afterScaleUpCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

      expect(afterScaleUpCount).toBe(2);
    });

    // ===== Step 5: 缩容 replicas 回 1 =====
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

    await step('等待 workerCount=1', {
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

    await step('验证缩容后 worker pod 数量为 1', {
      typingSpeed: 80,
      pauseAfter: 2500,
    }, async () => {
      const afterScaleDownCount = await getWorkerPodCount(kubectl, WORKLOAD_NAME);

      expect(afterScaleDownCount).toBe(1);
    });

    // ===== Step 6: 清理 =====
    await step('删除 TensorFusionWorkload', {
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
