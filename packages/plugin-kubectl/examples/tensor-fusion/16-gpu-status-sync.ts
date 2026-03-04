/**
 * Test Scenario 16: GPU Status Sync (PDF 4.1.1 + 4.1.2 + 4.1.3)
 *
 * Three sub-tests verifying GPU CRD status:
 * 1. GPU status sync: gpuModel, vendor, capacity, phase, uuid
 * 2. Capacity maintenance: available decreases on allocation, capacity unchanged
 * 3. runningApps list: workload appears/disappears correctly
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/16-gpu-status-sync.ts
 */

import {
  test,
  describe,
  expect,
  step,
  workloadYaml,
  DEFAULT_TIMEOUT,
  TEST_NAMESPACE,
  getFirstGpuName,
  getGpuAvailable,
  getWorkerPodNames,
  parseTflops,
  deleteResourceAndWait,
  waitFor,
} from './_config.js';

const WORKLOAD_NAME = 'test-gpu-status';

describe('Test Scenario 16: GPU Status Sync', { record: true }, () => {
  // ===== Test 1: GPU status fields (4.1.1) =====
  test('GPU status fields are correctly synced', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await step(
      'Verify GPU status fields',
      {
        typingSpeed: 0,
        pauseAfter: 2500,
      },
      async () => {
        const gpuName = await getFirstGpuName(kubectl);

        const status = await kubectl.getJsonPath<{
          gpuModel?: string;
          vendor?: string;
          phase?: string;
          uuid?: string;
          capacity?: { tflops?: string | number; vram?: string };
        }>('gpu', gpuName, '.status');

        expect(status?.gpuModel).toBeDefined();
        expect((status?.gpuModel ?? '').length).toBeGreaterThan(0);

        expect(status?.vendor?.toUpperCase()).toBe('NVIDIA');

        expect(status?.phase).toBe('Running');

        expect(status?.uuid).toBeDefined();
        expect((status?.uuid ?? '').length).toBeGreaterThan(0);

        expect(status?.capacity?.tflops).toBeDefined();
        expect(parseTflops(status?.capacity?.tflops ?? '0')).toBeGreaterThan(0);

        expect(status?.capacity?.vram).toBeDefined();
      }
    );
  });

  // ===== Test 2: Capacity maintenance (4.1.2) =====
  test('GPU capacity unchanged while available decreases on allocation', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let gpuName: string;
    let initialCapacityTflops: number;
    let initialAvailableTflops: number;
    let workloadCreated = false;

    await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

    try {
      await step(
        'Record initial GPU capacity and available',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          gpuName = await getFirstGpuName(kubectl);

          const status = await kubectl.getJsonPath<{
            capacity?: { tflops?: string | number };
            available?: { tflops?: string | number };
          }>('gpu', gpuName, '.status');

          initialCapacityTflops = parseTflops(status?.capacity?.tflops ?? '0');
          initialAvailableTflops = parseTflops(status?.available?.tflops ?? '0');
        }
      );

      await step(
        'Create workload and verify available decreases',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const yaml = workloadYaml(WORKLOAD_NAME);
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
          workloadCreated = true;

          const waitResult = await kubectl.wait('tensorfusionworkload', WORKLOAD_NAME, 'Ready', {
            timeout: DEFAULT_TIMEOUT,
          });
          await expect(waitResult).toBeSuccessful();

          // Poll for available decrease
          await waitFor(
            () => getGpuAvailable(kubectl, gpuName),
            (available) => parseTflops(available.tflops) < initialAvailableTflops,
            { description: 'GPU available decreases after allocation' }
          );
        }
      );

      await step(
        'Verify capacity unchanged',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const status = await kubectl.getJsonPath<{
            capacity?: { tflops?: string | number };
          }>('gpu', gpuName, '.status');

          const currentCapacity = parseTflops(status?.capacity?.tflops ?? '0');
          expect(currentCapacity).toBe(initialCapacityTflops);
        }
      );

      await step(
        'Delete workload and verify available recovers',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
          await expect(result).toBeSuccessful();
          workloadCreated = false;

          await waitFor(
            () => getGpuAvailable(kubectl, gpuName),
            (available) => parseTflops(available.tflops) >= initialAvailableTflops,
            { description: 'GPU available recovers after deletion' }
          );
        }
      );
    } finally {
      if (workloadCreated) {
        await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
      }
    }
  });

  // ===== Test 3: runningApps list (4.1.3) =====
  test('GPU runningApps correctly tracks workload lifecycle', async (ctx) => {
    const { kubectl } = ctx.plugins;
    let gpuName: string;
    let initialAvailableTflops: number;
    let workloadCreated = false;

    await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

    try {
      await step(
        'Acquire test GPU and record baseline',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1000,
        },
        async () => {
          gpuName = await getFirstGpuName(kubectl);
          const available = await getGpuAvailable(kubectl, gpuName);
          initialAvailableTflops = parseTflops(available.tflops);
        }
      );

      await step(
        'Create workload and verify runningApps contains it',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const yaml = workloadYaml(WORKLOAD_NAME);
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
          workloadCreated = true;

          const waitResult = await kubectl.wait('tensorfusionworkload', WORKLOAD_NAME, 'Ready', {
            timeout: DEFAULT_TIMEOUT,
          });
          await expect(waitResult).toBeSuccessful();

          await waitFor(
            () => kubectl.getJsonPath<Array<{ namespace?: string; name?: string }>>('gpu', gpuName, '.status.runningApps'),
            (runningApps) => (runningApps ?? []).map((app) => `${app.namespace}/${app.name}`).includes(`${TEST_NAMESPACE}/${WORKLOAD_NAME}`),
            { description: 'workload appears in GPU runningApps' }
          );
        }
      );

      await step(
        'Delete workload and verify cleanup',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
          await expect(result).toBeSuccessful();

          await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME, {
            timeoutMs: DEFAULT_TIMEOUT,
            throwOnTimeout: true,
          });

          workloadCreated = false;

          // Verify worker pods cleaned up
          await waitFor(
            () => getWorkerPodNames(kubectl, WORKLOAD_NAME),
            (names) => names.length === 0,
            { description: 'worker pods cleaned up' }
          );

          // Verify GPU available resources recovered
          // (Deallocate() updates Available immediately; agent syncs within 10s)
          await waitFor(
            () => getGpuAvailable(kubectl, gpuName),
            (available) => parseTflops(available.tflops) >= initialAvailableTflops,
            { description: 'GPU available resources recovered' }
          );
        }
      );
    } finally {
      if (workloadCreated) {
        await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
      }
    }
  });
});
