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
    // ===== Cluster Connection Check =====
    test('Verify Kubernetes cluster connection', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Check cluster connectivity', async () => {
            const clusterInfo = await kubectl.clusterInfo();
            expect(clusterInfo.reachable).toBe(true);
        });
    });

    // ===== Tensor Fusion Controller Check =====
    test('Verify Tensor Fusion Controller running status', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Check Controller Deployment', async () => {
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
    });

    // ===== GPUPool Check =====
    test('Verify GPUPool exists and is ready', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('Check GPUPool existence', async () => {
            const pool = gpupool(kubectl, TEST_GPU_POOL);
            await expect(pool).toExistInCluster();
        });

        await step('Check GPUPool status', async () => {
            const pool = gpupool(kubectl, TEST_GPU_POOL);
            await expect(pool).toHaveStatusField('phase', 'Running');
        });
    });

    // ===== GPU Resource Check =====
    test('Verify GPU resources are sufficient', async (ctx) => {
        const { kubectl } = ctx.plugins;

        const gpuName = await getFirstGpuName(kubectl);

        await step('Check GPU available resources', async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            const tflopsValue = parseTflops(available.tflops);

            // Verify resources meet test requirements (at least 2000m TFlops)
            expect(tflopsValue).toBeGreaterThanOrEqual(2000);
        });

        await step('Check GPU status', async () => {
            const exists = await kubectl.exists('gpu', gpuName);
            expect(exists).toBe(true);
        });
    });
});
