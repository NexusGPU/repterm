/**
 * Scenario 4: Resource release verification
 *
 * After deleting TensorFusionWorkload, verifies:
 * - GPU resources are released
 * - Available resources return to initial values
 * - Associated Worker Pods are cleaned up
 *
 * Run: bun run repterm packages/plugin-kubectl/examples/tensor-fusion/04-release.ts
 */

import {
    test,
    describe,
    expect,
    step,
    tensorfusionworkload,
    workloadYaml,
    DEFAULT_TIMEOUT,
    getFirstGpuName,
    getGpuAvailable,
    parseTflops,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-release';

describe('Scenario 4: Resource release verification', { record: true }, () => {
    let gpuName: string;
    let initialTflops: string;
    let allocatedTflops: string;

    // ===== Step 1: Record initial state =====
    test('Step 1: Record initial GPU resource state', async (ctx) => {
        const { kubectl } = ctx.plugins;

        kubectl.get()

        await step('Acquire test GPU', async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('Record initial available resources', async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
        });
    });

    // ===== Step 2: Create and wait for Workload ready =====
    test('Step 2: Create TensorFusionWorkload and wait for ready', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Create Workload', async () => {
            const yaml = workloadYaml(WORKLOAD_NAME, {
                tflopsRequest: '1000m',
                tflopsLimit: '2000m',
                vramRequest: '1Gi',
                vramLimit: '2Gi',
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        await step('Wait for Workload ready', async () => {
            await kubectl.wait(
                'tensorfusionworkload',
                WORKLOAD_NAME,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
        });

        await step('Record allocated resources', async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            allocatedTflops = available.tflops;

            const initialNum = parseTflops(initialTflops);
            const allocatedNum = parseTflops(allocatedTflops);

            // Verify resources were actually allocated
            expect(allocatedNum).toBeLessThan(initialNum);
        });
    });

    // ===== Step 3: Confirm Worker Pod exists =====
    test('Step 3: Confirm Worker Pod exists', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Find Worker Pod', async () => {
            const pods = await kubectl.get<{
                items: Array<{
                    metadata: { name: string };
                    status: { phase: string };
                }>;
            }>('pod', undefined, { selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME}` });

            expect(pods.items?.length).toBeGreaterThan(0);
            expect(pods.items[0].status.phase).toBe('Running');
        });
    });

    // ===== Step 4: Delete Workload =====
    test('Step 4: Delete TensorFusionWorkload', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Delete Workload', async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
        });

        await step('Wait for Workload deletion', async () => {
            const startTime = Date.now();
            const timeout = 30000;

            while (Date.now() - startTime < timeout) {
                const exists = await kubectl.exists('tensorfusionworkload', WORKLOAD_NAME);
                if (!exists) {
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // After timeout, assert workload does not exist
            const exists = await kubectl.exists('tensorfusionworkload', WORKLOAD_NAME);
            expect(exists).toBe(false);
        });
    });

    // ===== Step 5: Verify resource release =====
    test('Step 5: Verify GPU resources released', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Wait for resource release', async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));
        });

        await step('Check GPU available resources', async () => {
            const releasedAvailable = await getGpuAvailable(kubectl, gpuName);

            const initialNum = parseTflops(initialTflops);
            const releasedNum = parseTflops(releasedAvailable.tflops);

            // Verify resources restored (allow small tolerance)
            expect(Math.abs(releasedNum - initialNum)).toBeLessThan(100);
        });
    });

    // ===== Step 6: Verify Worker Pod cleaned up =====
    test('Step 6: Verify Worker Pod cleaned up', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Check Worker Pod', async () => {
            const pods = await kubectl.get<{
                items: Array<{
                    metadata: { name: string };
                    status: { phase: string };
                }>;
            }>('pod', undefined, { selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME}` });

            // Worker Pod should be deleted
            expect(pods.items?.length ?? 0).toBe(0);
        });
    });

    // ===== Step 7: Verify Workload gone =====
    test('Step 7: Confirm Workload fully deleted', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Verify Workload does not exist', async () => {
            const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
            await expect(workload).toNotExistInCluster();
        });
    });
});
