/**
 * Test Scenario 5: Multiple Workloads Sharing GPU
 *
 * Verify that when two TensorFusionWorkloads share the same GPU:
 * - Both workloads can be scheduled normally and enter Running state
 * - GPU.status.available resource deduction is accurate (double request amount)
 * - GPU.status.runningApps contains both workloads
 * - Resources correctly recover after deletion
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/05-multi-workload-shared-gpu.ts
 */

import { sleep } from 'bun';
import {
    test,
    describe,
    expect,
    step,
    gpu,
    tensorfusionworkload,
    workloadYaml,
    DEFAULT_TIMEOUT,
    getFirstGpuName,
    getGpuAvailable,
    parseTflops,
    TEST_NAMESPACE,
} from './_config.js';

const WL_NAME_1 = 'tf-share-wl-1';
const WL_NAME_2 = 'tf-share-wl-2';

/** TFlops requested by each workload (1 TFlops = 1000m) */
const TFLOPS_REQUEST = '1000m';
const TFLOPS_LIMIT = '1000m';
const VRAM_REQUEST = '1Gi';
const VRAM_LIMIT = '1Gi';

describe('Test Scenario 5: Multiple Workloads Sharing GPU', { record: true }, () => {
    test('Two TensorFusionWorkloads sharing single GPU complete flow', async (ctx) => {
        const { kubectl } = ctx.plugins;
        let gpuName: string;
        let initialTflops: string;

        // ===== Step 1: Record initial state =====
        await step('Acquire target GPU and record initial resources', {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 1500,
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);

            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;

            // Confirm GPU has sufficient resources for two workloads
            const initialNum = parseTflops(initialTflops);
            const requiredNum = parseTflops(TFLOPS_REQUEST) * 2;
            expect(initialNum).toBeGreaterThanOrEqual(requiredNum);
        });

        // ===== Step 2: Create two workloads =====
        await step('Create first Workload: ' + WL_NAME_1, {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
        }, async () => {
            const yaml = workloadYaml(WL_NAME_1, {
                tflopsRequest: TFLOPS_REQUEST,
                tflopsLimit: TFLOPS_LIMIT,
                vramRequest: VRAM_REQUEST,
                vramLimit: VRAM_LIMIT,
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        await step('Create second Workload: ' + WL_NAME_2, {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
        }, async () => {
            const yaml = workloadYaml(WL_NAME_2, {
                tflopsRequest: TFLOPS_REQUEST,
                tflopsLimit: TFLOPS_LIMIT,
                vramRequest: VRAM_REQUEST,
                vramLimit: VRAM_LIMIT,
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        // ===== Step 3: Wait for both workloads to become Running =====
        await step('Wait for ' + WL_NAME_1 + ' Ready', {
            showStepTitle: false,
            pauseAfter: 1500,
        }, async () => {
            const result = await kubectl.wait(
                'tensorfusionworkload',
                WL_NAME_1,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
            await expect(result).toBeSuccessful();
        });

        await step('Wait for ' + WL_NAME_2 + ' Ready', {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 1500,
        }, async () => {
            const result = await kubectl.wait(
                'tensorfusionworkload',
                WL_NAME_2,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
            await expect(result).toBeSuccessful();
        });

        await step('Verify both Workload statuses are Running', {
            typingSpeed: 0,
            pauseAfter: 2000,
        }, async () => {
            const wl1 = tensorfusionworkload(kubectl, WL_NAME_1);
            await expect(wl1).toHaveStatusField('phase', 'Running');

            const wl2 = tensorfusionworkload(kubectl, WL_NAME_2);
            await expect(wl2).toHaveStatusField('phase', 'Running');
        });

        // ===== Step 4: Verify GPU available resource deduction =====
        await step('Check GPU available resources change', {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2500,
        }, async () => {
            await sleep(1000);
            const afterAvailable = await getGpuAvailable(kubectl, gpuName);

            const initialNum = parseTflops(initialTflops);
            const afterNum = parseTflops(afterAvailable.tflops);
            const expectedDeduction = parseTflops(TFLOPS_REQUEST) * 2;

            // TFlops should decrease by about 2 workloads' request amount
            expect(afterNum).toBeLessThan(initialNum);
            expect(initialNum - afterNum).toBeGreaterThanOrEqual(expectedDeduction - 100);
            expect(initialNum - afterNum).toBeLessThanOrEqual(expectedDeduction + 100);
        });

        // ===== Step 5: Verify runningApps =====
        await step('Check GPU runningApps contains both workloads', {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2500,
        }, async () => {
            const runningApps = await kubectl.getJsonPath<Array<{
                namespace?: string;
                name?: string;
                count?: number;
            }>>(
                'gpu', gpuName, '.status.runningApps'
            );

            expect(runningApps).toBeDefined();
            expect(Array.isArray(runningApps)).toBe(true);

            const appNames = (runningApps ?? []).map(
                app => `${app.namespace}/${app.name}`
            );

            expect(appNames).toContain(`${TEST_NAMESPACE}/${WL_NAME_1}`);
            expect(appNames).toContain(`${TEST_NAMESPACE}/${WL_NAME_2}`);
        });

        // ===== Step 6: Cleanup =====
        await step('Delete two TensorFusionWorkloads', {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
        }, async () => {
            const r1 = await kubectl.delete('tensorfusionworkload', WL_NAME_1);
            await expect(r1).toBeSuccessful();

            const r2 = await kubectl.delete('tensorfusionworkload', WL_NAME_2);
            await expect(r2).toBeSuccessful();
        });

        await step('Wait for resource release and verify recovery', {
            typingSpeed: 0,
            pauseAfter: 2000,
        }, async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));

            const afterRelease = await getGpuAvailable(kubectl, gpuName);
            const releasedNum = parseTflops(afterRelease.tflops);
            const initialNum = parseTflops(initialTflops);

            // Allow small tolerance, but should approach initial value
            expect(releasedNum).toBeGreaterThanOrEqual(initialNum - 100);
        });
    });
});
