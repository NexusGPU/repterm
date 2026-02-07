/**
 * Test Scenario 1: Normal Resource Allocation - Using TensorFusionWorkload
 *
 * Verify that by creating a TensorFusionWorkload:
 * - GPU resources are correctly allocated
 * - Workload status changes to Running
 * - GPU available resources decrease correctly
 * - Worker Pod contains correct annotations
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/01-workload-allocation.ts
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
    getFirstGpuName,
    getGpuAvailable,
    parseTflops,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-alloc';

describe('Test Scenario 1: Normal Resource Allocation - TensorFusionWorkload', { record: true }, () => {
    test('TensorFusionWorkload resource allocation complete flow', async (ctx) => {
        const { kubectl } = ctx.plugins;
        let gpuName: string;
        let initialTflops: string;

        // ===== Step 1: Record initial state =====
        await step('Acquire test GPU', {
            showStepTitle: false,
            typingSpeed: 60,  // Fast execution during preparation phase
            pauseAfter: 1000
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('Record initial available resources', {
            typingSpeed: 60,
            pauseAfter: 1500  // Allow viewer to see initial state
        }, async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
        });

        // ===== Step 2: Create resource (core operation) =====
        await step('Create Workload', {
            showStepTitle: false,
            typingSpeed: 100,  // Core operation with slower typing
            pauseAfter: 3000   // Important output, longer pause
        }, async () => {
            const yaml = workloadYaml(WORKLOAD_NAME, {
                tflopsRequest: '1000m',
                tflopsLimit: '2000m',
                vramRequest: '1Gi',
                vramLimit: '2Gi',
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        // ===== Step 3: Wait for Workload ready =====
        await step('Wait for Ready condition', {
            showStepTitle: false,
            pauseAfter: 2000
        }, async () => {
            const result = await kubectl.wait(
                'tensorfusionworkload',
                WORKLOAD_NAME,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
            await expect(result).toBeSuccessful();
        });

        await step('Verify Workload status is Running', {
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
            await expect(workload).toHaveStatusField('phase', 'Running');
        });

        // ===== Step 4: Verify resource allocation results =====
        await step('Check GPU available resources change', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2500  // Verification results need reading time
        }, async () => {
            sleep(1000)
            const afterAvailable = await getGpuAvailable(kubectl, gpuName);

            const initialTflopsNum = parseTflops(initialTflops);
            const afterTflopsNum = parseTflops(afterAvailable.tflops);

            // TFlops should decrease
            expect(afterTflopsNum).toBeLessThan(initialTflopsNum);
        });

        await step('Verify Workload readyWorkers', {
            pauseAfter: 1500
        }, async () => {
            const status = await kubectl.getJsonPath<{
                phase?: string;
                readyWorkers?: number;
            }>('tensorfusionworkload', WORKLOAD_NAME, '.status');

            expect(status?.phase).toBe('Running');
            expect(status?.readyWorkers).toBe(1);
        });

        // ===== Step 5: Verify Worker Pod =====
        await step('Find and verify Worker Pod', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const pods = await kubectl.get<Array<{
                name: string;
                phase: string;
                annotations: Record<string, string>;
            }>>('pod', undefined, {
                selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME}`,
                jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase, annotations: .metadata.annotations}]'
            });

            expect(pods?.length).toBeGreaterThan(0);

            const workerPod = pods[0];
            expect(workerPod.phase).toBe('Running');

            // Verify annotations exist
            const annotations = workerPod.annotations ?? {};
            expect(annotations['tensor-fusion.ai/tflops-request']).toBeDefined();
            expect(annotations['tensor-fusion.ai/vram-request']).toBeDefined();
        });

        // ===== Step 6: Check associated TensorFusionConnection (if using remote vGPU) =====
        await step('Query associated Connection', {
            pauseAfter: 1500
        }, async () => {
            try {
                const connections = await kubectl.get<Array<{
                    name: string;
                    phase?: string;
                }>>('tensorfusionconnection', undefined, {
                    selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME}`,
                    jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]'
                });

                // Connection may not exist (local GPU mode), not an error
                if (connections && connections.length > 0) {
                    for (const conn of connections) {
                        expect(conn.phase).toBeDefined();
                    }
                }
            } catch {
                // TensorFusionConnection CRD may not exist
            }
        });

        // ===== Cleanup =====
        await step('Delete TensorFusionWorkload', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
        });

        await step('Wait for resource release and verify', {
            pauseAfter: 2000
        }, async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Verify resources released (TFlops should recover)
            const afterRelease = await getGpuAvailable(kubectl, gpuName);
            const releasedTflops = parseTflops(afterRelease.tflops);
            const initialTflopsNum = parseTflops(initialTflops);

            // Allow small tolerance, but should approach initial value
            expect(releasedTflops).toBeGreaterThanOrEqual(initialTflopsNum - 100);
        });
    });
});
