/**
 * Test Scenario 18: GPUPool Capacity (PDF 4.3.1 + 4.3.2 + 4.3.3)
 *
 * Verify GPUPool capacity statistics:
 * 1. Capacity: totalGPUs, totalTFlops, totalVRAM, totalNodes
 * 2. Available resources: decrease on allocation, recover on release
 * 3. Node association: totalNodes matches actual GPUNode count
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/18-gpupool-capacity.ts
 */

import {
  test,
  describe,
  expect,
  step,
  workloadYaml,
  DEFAULT_TIMEOUT,
  TEST_GPU_POOL,
  parseTflops,
  deleteResourceAndWait,
  waitFor,
} from './_config.js';

const WORKLOAD_NAME = 'test-pool-capacity';

describe(
  'Test Scenario 18: GPUPool Capacity',
  { record: true },
  () => {
    // ===== Test 1: Capacity statistics (4.3.1) =====
    test('GPUPool capacity statistics are correct', async (ctx) => {
      const { kubectl } = ctx.plugins;

      await step(
        'Verify GPUPool capacity fields',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const status = await kubectl.getJsonPath<{
            totalGPUs?: number;
            totalTFlops?: string | number;
            totalVRAM?: string;
            totalNodes?: number;
            phase?: string;
          }>('gpupool', TEST_GPU_POOL, '.status');

          expect(status?.phase).toBe('Running');

          expect(status?.totalGPUs).toBeDefined();
          expect(status?.totalGPUs).toBeGreaterThanOrEqual(1);

          expect(status?.totalTFlops).toBeDefined();
          expect(parseTflops(status?.totalTFlops ?? '0')).toBeGreaterThan(0);

          expect(status?.totalVRAM).toBeDefined();

          expect(status?.totalNodes).toBeDefined();
          expect(status?.totalNodes).toBeGreaterThanOrEqual(1);
        }
      );
    });

    // ===== Test 2: Available resources (4.3.2) =====
    test('GPUPool available resources track allocation lifecycle', async (ctx) => {
      const { kubectl } = ctx.plugins;
      let initialAvailableTflops: number;
      let workloadCreated = false;

      await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);

      try {
        await step(
          'Record initial available resources',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 1500,
          },
          async () => {
            const status = await kubectl.getJsonPath<{
              availableTFlops?: string | number;
            }>('gpupool', TEST_GPU_POOL, '.status');

            initialAvailableTflops = parseTflops(status?.availableTFlops ?? '0');
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

            const waitResult = await kubectl.wait(
              'tensorfusionworkload',
              WORKLOAD_NAME,
              'Ready',
              { timeout: DEFAULT_TIMEOUT }
            );
            await expect(waitResult).toBeSuccessful();

            await waitFor(
              () => kubectl.getJsonPath<{ availableTFlops?: string | number }>('gpupool', TEST_GPU_POOL, '.status'),
              (status) => parseTflops(status?.availableTFlops ?? '0') < initialAvailableTflops,
              { description: 'GPUPool available decreases after allocation' }
            );
          }
        );

        await step(
          'Delete workload and verify available recovers',
          {
            typingSpeed: 0,
            pauseAfter: 2500,
          },
          async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
            workloadCreated = false;

            await waitFor(
              () => kubectl.getJsonPath<{ availableTFlops?: string | number }>('gpupool', TEST_GPU_POOL, '.status'),
              (status) => parseTflops(status?.availableTFlops ?? '0') >= initialAvailableTflops,
              { description: 'GPUPool available recovers after deletion' }
            );
          }
        );
      } finally {
        if (workloadCreated) {
          await deleteResourceAndWait(kubectl, 'tensorfusionworkload', WORKLOAD_NAME);
        }
      }
    });

    // ===== Test 3: Node association (4.3.3) =====
    test('GPUPool node count matches actual GPUNode resources', async (ctx) => {
      const { kubectl } = ctx.plugins;

      await step(
        'Verify node association',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const status = await kubectl.getJsonPath<{
            totalNodes?: number;
            readyNodes?: number;
          }>('gpupool', TEST_GPU_POOL, '.status');

          expect(status?.totalNodes).toBeDefined();
          expect(status?.totalNodes).toBeGreaterThanOrEqual(1);

          expect(status?.readyNodes).toBeDefined();
          expect(status?.readyNodes).toBeGreaterThanOrEqual(1);

          // Query actual GPUNodes associated with this pool
          const gpuNodes = await kubectl.get<Array<{ name: string }>>('gpunode', '', {
            jqFilter: `[.items[] | select(.metadata.ownerReferences[]? | .name == "${TEST_GPU_POOL}" and .kind == "GPUPool") | {name: .metadata.name}]`,
          });

          expect(gpuNodes?.length).toBe(status?.totalNodes);
        }
      );
    });
  }
);
