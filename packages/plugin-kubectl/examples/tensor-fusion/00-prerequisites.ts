/**
 * Test Scenario 0: Prerequisites Check
 *
 * Verify the test environment meets the following conditions:
 * - Kubernetes cluster connection is working
 * - Tensor Fusion Controller is running properly
 * - GPUPool exists and status is Ready
 * - At least one available GPU with sufficient resources
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/00-prerequisites.ts
 */

import {
    test,
    describe,
    expect,
    step,
    gpupool,
    resource,
    TEST_GPU_POOL,
    TF_SYSTEM_NAMESPACE,
    TF_CONTROLLER_DEPLOYMENT,
    getFirstGpuName,
    getGpuAvailable,
    parseTflops,
} from './_config.js';

describe('Prerequisites Check', { record: true }, () => {
    test('Verify environment prerequisites', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // ===== Cluster Connection Check =====
        await step('Check cluster connectivity', { typingSpeed: 0 }, async () => {
            const clusterInfo = await kubectl.clusterInfo();
            expect(clusterInfo.reachable).toBe(true);
        });

        // ===== Tensor Fusion Controller Check =====
        await step('Check Controller Deployment', { typingSpeed: 0 }, async () => {
            const originalNs = kubectl.getNamespace();
            kubectl.setNamespace(TF_SYSTEM_NAMESPACE);

            try {
                const controllerDeployment = resource(kubectl, 'deployment', TF_CONTROLLER_DEPLOYMENT);
                await expect(controllerDeployment).toExistInCluster();
                await expect(controllerDeployment).toBeAvailable();
            } finally {
                kubectl.setNamespace(originalNs);
            }
        });

        // ===== GPUPool Check =====
        await step('Check GPUPool existence', { typingSpeed: 0 }, async () => {
            const pool = gpupool(kubectl, TEST_GPU_POOL);
            await expect(pool).toExistInCluster();
        });

        await step('Check GPUPool status', { typingSpeed: 0 }, async () => {
            const pool = gpupool(kubectl, TEST_GPU_POOL);
            await expect(pool).toHaveStatusField('phase', 'Running');
        });

        // ===== GPU Resource Check =====
        const gpuName = await getFirstGpuName(kubectl);

        await step('Check GPU available resources', { typingSpeed: 0 }, async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            const tflopsValue = parseTflops(available.tflops);

            // Verify resources meet test requirements (at least 2000m TFlops)
            expect(tflopsValue).toBeGreaterThanOrEqual(2000);
        });

        await step('Check GPU status', { typingSpeed: 0 }, async () => {
            const exists = await kubectl.exists('gpu', gpuName);
            expect(exists).toBe(true);
        });
    });
});
