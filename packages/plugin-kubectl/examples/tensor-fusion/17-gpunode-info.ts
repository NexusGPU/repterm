/**
 * Test Scenario 17: GPUNode Info (PDF 4.2.1 + 4.2.2)
 *
 * Verify GPUNode discovery and capacity statistics:
 * 1. Node discovery: phase, nodeInfo, managedGPUs, managedGPUDeviceIDs
 * 2. Capacity statistics: totalGPUs, totalTFlops, totalVRAM, available resources
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/17-gpunode-info.ts
 */

import {
  test,
  describe,
  expect,
  step,
  getFirstGpuNodeName,
  parseTflops,
} from './_config.js';

describe(
  'Test Scenario 17: GPUNode Info',
  { record: true },
  () => {
    // ===== Test 1: Node discovery (4.2.1) =====
    test('GPUNode is discovered and has correct status', async (ctx) => {
      const { kubectl } = ctx.plugins;

      await step(
        'Verify GPUNode exists and is Running',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const nodes = await kubectl.get<Array<{ name: string }>>('gpunode', '', {
            jqFilter: '[.items[] | {name: .metadata.name}]',
          });

          expect(nodes?.length).toBeGreaterThan(0);

          const nodeName = await getFirstGpuNodeName(kubectl);

          const status = await kubectl.getJsonPath<{
            phase?: string;
            managedGPUs?: number;
            managedGPUDeviceIDs?: string[];
            nodeInfo?: {
              dataDiskSize?: string;
              ramSize?: string;
            };
          }>('gpunode', nodeName, '.status');

          expect(status?.phase).toBe('Running');

          expect(status?.managedGPUs).toBeDefined();
          expect(status?.managedGPUs).toBeGreaterThanOrEqual(1);

          expect(status?.managedGPUDeviceIDs).toBeDefined();
          expect(status?.managedGPUDeviceIDs?.length).toBeGreaterThan(0);

          expect(status?.nodeInfo).toBeDefined();
        }
      );

      await step(
        'Verify associated GPU resources exist',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const nodeName = await getFirstGpuNodeName(kubectl);

          const gpus = await kubectl.get<Array<{ name: string }>>('gpu', '', {
            jqFilter: `[.items[] | select(.status.nodeSelector["kubernetes.io/hostname"] == "${nodeName}" or .metadata.ownerReferences[0].name == "${nodeName}") | {name: .metadata.name}]`,
          });

          expect(gpus?.length).toBeGreaterThan(0);
        }
      );
    });

    // ===== Test 2: Capacity statistics (4.2.2) =====
    test('GPUNode capacity statistics are accurate', async (ctx) => {
      const { kubectl } = ctx.plugins;

      await step(
        'Verify GPUNode capacity fields',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const nodeName = await getFirstGpuNodeName(kubectl);

          const status = await kubectl.getJsonPath<{
            totalGPUs?: number;
            totalTFlops?: string | number;
            totalVRAM?: string;
            availableTFlops?: string | number;
            availableVRAM?: string;
          }>('gpunode', nodeName, '.status');

          expect(status?.totalGPUs).toBeDefined();
          expect(status?.totalGPUs).toBeGreaterThanOrEqual(1);

          expect(status?.totalTFlops).toBeDefined();
          expect(parseTflops(status?.totalTFlops ?? '0')).toBeGreaterThan(0);

          expect(status?.totalVRAM).toBeDefined();

          expect(status?.availableTFlops).toBeDefined();
          expect(status?.availableVRAM).toBeDefined();
        }
      );
    });
  }
);
