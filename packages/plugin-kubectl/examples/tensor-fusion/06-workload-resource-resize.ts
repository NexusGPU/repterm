/**
 * Test Scenario 6: GPU Resource Adjustment (Scale-up)
 *
 * Based on `GPU_Resource_Adjustment_Test.md`:
 * - First create a TensorFusionWorkload with allocated GPU resources
 * - Record GPU available resources and worker Pod annotations
 * - Manually patch workload to scale up resources
 * - Verify GPU available resources continue to decrease, worker annotations updated
 *
 * Run with:
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
const INITIAL_VRAM = '1Gi';

const TARGET_TFLOPS = '200m';
const TARGET_VRAM = '2Gi';

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
    // When gpuId is not GPU CR name, proceed to reverse lookup via UUID
  }

  const mapped = await kubectl.get<string | null>('gpu', undefined, {
    jqFilter: `[.items[] | select(.status.uuid == "${gpuId}")][0].metadata.name`,
  });

  if (!mapped || mapped === 'null') {
    throw new Error(`Cannot resolve GPU resource name from id: ${gpuId}`);
  }

  return String(mapped);
}

describe('Test Scenario 6: GPU Resource Adjustment (Scale-up)', { record: true }, () => {
  test('TensorFusionWorkload GPU and worker annotations sync update after scale-up', async (ctx) => {
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

    // ===== Step 1: Create initial Workload and wait for ready =====
    await step(
      'Create initial Workload (100m/8Gi)',
      {
        showStepTitle: false,
        typingSpeed: 0,
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
      'Wait for Workload Ready and confirm Running',
      {
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

    // ===== Step 2: Record baseline before scale-up =====
    await step(
      'Record GPU available resources and worker annotations before scale-up',
      {
        showStepTitle: false,
        typingSpeed: 0,
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

        gpuName = await resolveGpuNameFromId(kubectl, gpuId!);
        const beforeGpu = await getGpuAvailable(kubectl, gpuName);
        beforeGpuTflops = beforeGpu.tflops;
        beforeGpuVram = beforeGpu.vram;
      }
    );

    // ===== Step 3: Scale up workload resources =====
    await step(
      'patch Workload resources to 200m/16Gi',
      {
        showStepTitle: false,
        typingSpeed: 0,
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

    // ===== Step 4: Wait for worker annotations to update =====
    await step(
      'Wait for worker annotations to update to target values',
      {
        showStepTitle: false,
        typingSpeed: 0,
        pauseAfter: 2000,
      },
      async () => {
        const deadline = Date.now() + DEFAULT_TIMEOUT;

        while (Date.now() < deadline) {
          workerPodName = await getWorkerPodName(kubectl, WORKLOAD_NAME);
          const currentWorker = await getWorkerResources(kubectl, workerPodName);

          if (
            currentWorker.tflops === TARGET_TFLOPS &&
            currentWorker.vram === TARGET_VRAM
          ) {
            afterWorkerTflops = currentWorker.tflops;
            afterWorkerVram = currentWorker.vram;
            break;
          }

          await sleep(3000);
        }

        expect(afterWorkerTflops).toBe(TARGET_TFLOPS);
        expect(afterWorkerVram).toBe(TARGET_VRAM);
      }
    );

    // ===== Step 5: Cleanup =====
    await step(
      'Delete Workload and wait for resource release',
      {
        showStepTitle: false,
        typingSpeed: 0,
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
