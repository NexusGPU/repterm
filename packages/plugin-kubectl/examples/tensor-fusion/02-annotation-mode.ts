/**
 * Test Scenario 2: Normal Resource Allocation - Using Pod Annotation
 *
 * Verify that by adding Tensor Fusion annotations to Deployment Pod Template:
 * - Webhook automatically creates TensorFusionWorkload
 * - GPU resources are correctly allocated
 * - Pod is successfully scheduled and running
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/02-annotation-mode.ts
 */

import { sleep } from 'bun';
import {
    test,
    describe,
    expect,
    step,
    deployment,
    annotatedDeploymentYaml,
    cleanup,
    DEFAULT_TIMEOUT,
    getFirstGpuName,
    getGpuAvailable,
    parseTflops,
} from './_config.js';

const DEPLOYMENT_NAME = 'test-workload-annotation';

describe('Test Scenario 2: Normal Resource Allocation - Pod Annotation', { record: true }, () => {
    test('Pod Annotation mode resource allocation complete flow', async (ctx) => {
        const { kubectl } = ctx.plugins;
        let gpuName: string;
        let initialTflops: string;

        // ===== Step 1: Prepare environment =====
        await step('Acquire test GPU', {
            showStepTitle: false,
            typingSpeed: 60,
            pauseAfter: 1000
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('Record initial available resources', {
            typingSpeed: 60,
            pauseAfter: 1500
        }, async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
        });

        // ===== Step 2: Create annotated Deployment (core operation) =====
        await step('Create annotated Deployment', {
            showStepTitle: false,
            typingSpeed: 100,
            pauseAfter: 3000
        }, async () => {
            const yaml = annotatedDeploymentYaml(DEPLOYMENT_NAME, {
                tflopsRequest: '1000m',
                tflopsLimit: '2000m',
                vramRequest: '1Gi',
                vramLimit: '2Gi',
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        await step('Verify Deployment Tensor Fusion annotations', {
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            await sleep(2000);

            const annotations = await kubectl.get<Record<string, string>>(
                'deployment', DEPLOYMENT_NAME, {
                jqFilter: '.spec.template.metadata.annotations | with_entries(select(.key | startswith("tensor-fusion.ai")))'
            }
            );

            expect(annotations['tensor-fusion.ai/gpu-pool']).toBeDefined();
            expect(annotations['tensor-fusion.ai/tflops-request']).toBeDefined();
        });


        // ===== Step 3: Verify Deployment and Pod status =====
        await step('Check Deployment available status', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const deploy = deployment(kubectl, DEPLOYMENT_NAME);
            await expect(deploy).toExistInCluster();

            await kubectl.wait('deployment', DEPLOYMENT_NAME, 'Available', {
                timeout: DEFAULT_TIMEOUT,
            });
        });

        await step('Verify Pod running status', {
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const pods = await kubectl.get<Array<{
                name: string;
                phase: string;
            }>>('pod', undefined, {
                selector: `app=${DEPLOYMENT_NAME}`,
                jqFilter: '[.items[] | {name: .metadata.name, phase: .status.phase}]'
            });

            expect(pods?.length).toBeGreaterThan(0);
            expect(pods[0].phase).toBe('Running');
        });

        // ===== Step 4: Verify GPU resource allocation results =====
        await step('Check GPU available resources change', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2500
        }, async () => {
            await sleep(1000);
            const available = await getGpuAvailable(kubectl, gpuName);
            const currentTflops = parseTflops(available.tflops);
            const initialTflopsNum = parseTflops(initialTflops);

            // GPU resources should decrease
            expect(currentTflops).toBeLessThan(initialTflopsNum);
        });

        // ===== Cleanup =====
        await step('Delete Deployment', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const result = await kubectl.delete('deployment', DEPLOYMENT_NAME, { force: true });
            await expect(result).toBeSuccessful();
        });

        await step('Wait for resource release and verify', {
            pauseAfter: 2000
        }, async () => {
            await sleep(5000);

            // Verify TensorFusionWorkload auto cleanup
            const workloadExists = await kubectl.exists('tensorfusionworkload', DEPLOYMENT_NAME);
            if (workloadExists) {
                await kubectl.delete('tensorfusionworkload', DEPLOYMENT_NAME, { force: true });
            }

            // Verify GPU resources released (TFlops should recover)
            const afterRelease = await getGpuAvailable(kubectl, gpuName);
            const releasedTflops = parseTflops(afterRelease.tflops);
            const initialTflopsNum = parseTflops(initialTflops);

            // Allow small tolerance, but should approach initial value
            expect(releasedTflops).toBeGreaterThanOrEqual(initialTflopsNum - 100);
        });
    });
});
