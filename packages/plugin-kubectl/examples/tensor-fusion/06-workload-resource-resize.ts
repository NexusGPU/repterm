/**
 * 测试场景 6: GPU 资源调整（扩容）
 *
 * 基于 `GPU资源调整测试.md`：
 * - 先创建一个已分配 GPU 资源的 TensorFusionWorkload
 * - 记录 GPU 可用资源与 worker Pod 注解
 * - 手动 patch workload 扩容资源
 * - 验证 GPU 可用资源继续下降，worker 注解已更新
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/06-workload-resource-resize.ts
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
  getGpuAvailable,
  parseTflops,
  type KubectlMethods,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-resize';

const INITIAL_TFLOPS = '100m';
const INITIAL_VRAM = '8Gi';

const TARGET_TFLOPS = '200m';
const TARGET_VRAM = '16Gi';

function parseResourceBytes(value: string | number): number {
  const text = String(value).trim();
  if (!text) {
    return 0;
  }

  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z]+)?$/);
  if (!match) {
    return Number(text) || 0;
  }

  const num = Number(match[1]);
  const unit = match[2] ?? '';

  const binaryUnits: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };

  const decimalUnits: Record<string, number> = {
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
    m: 0.001,
  };

  if (binaryUnits[unit] !== undefined) {
    return num * binaryUnits[unit];
  }

  if (decimalUnits[unit] !== undefined) {
    return num * decimalUnits[unit];
  }

  return num;
}

async function getWorkerPodName(kubectl: KubectlMethods, workloadName: string): Promise<string> {
  let workerPods = await kubectl.get<Array<{ name: string; phase: string }>>('pod', undefined, {
    selector: `tensor-fusion.ai/workload=${workloadName},tensor-fusion.ai/component=worker`,
    jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]',
  });

  if (!workerPods || workerPods.length === 0) {
    workerPods = await kubectl.get<Array<{ name: string; phase: string }>>('pod', undefined, {
      selector: `tensor-fusion.ai/workload=${workloadName}`,
      jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]',
    });
  }

  if (!workerPods || workerPods.length === 0) {
    throw new Error(`No worker pod found for workload ${workloadName}`);
  }

  const runningPod = workerPods.find((podInfo) => podInfo.phase === 'Running');
  return runningPod?.name ?? workerPods[0].name;
}

async function getWorkerResources(
  kubectl: KubectlMethods,
  workerPodName: string
): Promise<{ tflops: string; vram: string; gpuIds: string }> {
  const data = await kubectl.get<{
    tflops?: string;
    vram?: string;
    gpuIds?: string;
  }>('pod', workerPodName, {
    jqFilter:
      '{tflops: .metadata.annotations["tensor-fusion.ai/tflops-request"], vram: .metadata.annotations["tensor-fusion.ai/vram-request"], gpuIds: .metadata.annotations["tensor-fusion.ai/gpu-ids"]}',
  });

  return {
    tflops: String(data?.tflops ?? ''),
    vram: String(data?.vram ?? ''),
    gpuIds: String(data?.gpuIds ?? ''),
  };
}

async function resolveGpuNameFromId(kubectl: KubectlMethods, gpuId: string): Promise<string> {
  try {
    const direct = await kubectl.getJsonPath<string>('gpu', gpuId, '.metadata.name');
    if (direct) {
      return direct;
    }
  } catch {
    // gpuId 不是 GPU CR 名称时，继续走 UUID 反查
  }

  const mapped = await kubectl.get<string | null>('gpu', undefined, {
    jqFilter: `[.items[] | select(.status.uuid == "${gpuId}")][0].metadata.name`,
  });

  if (!mapped || mapped === 'null') {
    throw new Error(`Cannot resolve GPU resource name from id: ${gpuId}`);
  }

  return String(mapped);
}

describe('测试场景 6: GPU 资源调整（扩容）', { record: true }, () => {
  test('TensorFusionWorkload 扩容后 GPU 与 worker 注解同步更新', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let workerPodName: string;
    let gpuName: string;

    let beforeGpuTflops: string;
    let beforeGpuVram: string;
    let beforeWorkerTflops: string;
    let beforeWorkerVram: string;

    let afterGpuTflops: string;
    let afterGpuVram: string;
    let afterWorkerTflops: string;
    let afterWorkerVram: string;
    let beforeGpuId: string;
    let afterGpuId: string;

    // ===== Step 1: 创建初始 Workload 并等待就绪 =====
    await step(
      '创建初始 Workload（100m/8Gi）',
      {
        showStepTitle: false,
        typingSpeed: 100,
        pauseAfter: 1800,
      },
      async () => {
        const yaml = workloadYaml(WORKLOAD_NAME, {
          tflopsRequest: INITIAL_TFLOPS,
          tflopsLimit: INITIAL_TFLOPS,
          vramRequest: INITIAL_VRAM,
          vramLimit: INITIAL_VRAM,
        });

        const result = await kubectl.apply(yaml);
        await expect(result).toBeSuccessful();
      }
    );

    await step(
      '等待 Workload Ready 并确认 Running',
      {
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

    // ===== Step 2: 记录扩容前基线 =====
    await step(
      '记录扩容前 GPU 可用资源与 worker 注解',
      {
        showStepTitle: false,
        typingSpeed: 80,
        pauseAfter: 2000,
      },
      async () => {
        workerPodName = await getWorkerPodName(kubectl, WORKLOAD_NAME);

        const beforeWorker = await getWorkerResources(kubectl, workerPodName);
        beforeWorkerTflops = beforeWorker.tflops;
        beforeWorkerVram = beforeWorker.vram;

        expect(beforeWorkerTflops).toBe(INITIAL_TFLOPS);
        expect(beforeWorkerVram).toBe(INITIAL_VRAM);

        const gpuId = beforeWorker.gpuIds.split(',')[0]?.trim();
        expect(gpuId).toBeDefined();
        expect(gpuId?.length ?? 0).toBeGreaterThan(0);

        beforeGpuId = gpuId!;
        gpuName = await resolveGpuNameFromId(kubectl, beforeGpuId);
        const beforeGpu = await getGpuAvailable(kubectl, gpuName);
        beforeGpuTflops = beforeGpu.tflops;
        beforeGpuVram = beforeGpu.vram;
      }
    );

    // ===== Step 3: 扩容 workload 资源 =====
    await step(
      'patch Workload 资源到 200m/16Gi',
      {
        showStepTitle: false,
        typingSpeed: 100,
        pauseAfter: 1800,
      },
      async () => {
        const patchResult = await kubectl.patch(
          'tensorfusionworkload',
          WORKLOAD_NAME,
          {
            spec: {
              resources: {
                requests: {
                  tflops: TARGET_TFLOPS,
                  vram: TARGET_VRAM,
                },
                limits: {
                  tflops: TARGET_TFLOPS,
                  vram: TARGET_VRAM,
                },
              },
            },
          },
          'merge'
        );

        await expect(patchResult).toBeSuccessful();

        const spec = await kubectl.getJsonPath<{ requests?: { tflops?: string; vram?: string } }>(
          'tensorfusionworkload',
          WORKLOAD_NAME,
          '.spec.resources'
        );

        expect(spec?.requests?.tflops).toBe(TARGET_TFLOPS);
        expect(spec?.requests?.vram).toBe(TARGET_VRAM);
      }
    );

    // ===== Step 4: 等待 worker 注解更新 =====
    await step(
      '等待 worker 注解更新为目标值',
      {
        showStepTitle: false,
        typingSpeed: 80,
        pauseAfter: 2000,
      },
      async () => {
        const deadline = Date.now() + DEFAULT_TIMEOUT;

        while (Date.now() < deadline) {
          workerPodName = await getWorkerPodName(kubectl, WORKLOAD_NAME);
          const currentWorker = await getWorkerResources(kubectl, workerPodName);

          if (currentWorker.tflops === TARGET_TFLOPS && currentWorker.vram === TARGET_VRAM) {
            afterWorkerTflops = currentWorker.tflops;
            afterWorkerVram = currentWorker.vram;
            afterGpuId = currentWorker.gpuIds.split(',')[0]?.trim() ?? '';
            break;
          }

          await sleep(3000);
        }

        expect(afterWorkerTflops).toBe(TARGET_TFLOPS);
        expect(afterWorkerVram).toBe(TARGET_VRAM);
        expect(afterGpuId).toBe(beforeGpuId);
      }
    );

    // ===== Step 5: 验证 GPU 可用资源进一步下降 =====
    await step(
      '验证 GPU 可用资源进一步减少',
      {
        typingSpeed: 80,
        pauseAfter: 2200,
      },
      async () => {
        const afterGpu = await getGpuAvailable(kubectl, gpuName);
        afterGpuTflops = afterGpu.tflops;
        afterGpuVram = afterGpu.vram;

        const beforeTflopsNum = parseTflops(beforeGpuTflops);
        const afterTflopsNum = parseTflops(afterGpuTflops);

        const beforeVramBytes = parseResourceBytes(beforeGpuVram);
        const afterVramBytes = parseResourceBytes(afterGpuVram);

        expect(afterTflopsNum).toBeLessThan(beforeTflopsNum);
        expect(afterVramBytes).toBeLessThan(beforeVramBytes);
      }
    );

    // ===== Step 6: 清理 =====
    await step(
      '删除 Workload 并等待资源释放',
      {
        showStepTitle: false,
        typingSpeed: 80,
        pauseAfter: 1800,
      },
      async () => {
        const deleteResult = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
        await expect(deleteResult).toBeSuccessful();

        await sleep(5000);
      }
    );
  });
});
