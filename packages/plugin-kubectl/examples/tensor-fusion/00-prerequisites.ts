/**
 * 测试场景 0: 前置条件检查
 *
 * 验证测试环境满足以下条件：
 * - Kubernetes 集群连接正常
 * - Tensor Fusion Controller 运行正常
 * - GPUPool 存在且状态为 Ready
 * - 至少有一个可用 GPU，资源充足
 *
 * 运行方式:
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

describe('前置条件检查', { record: true }, () => {
    // ===== 集群连接检查 =====
    test('验证 Kubernetes 集群连接', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('检查集群连接状态', async () => {
            const clusterInfo = await kubectl.clusterInfo();
            expect(clusterInfo.reachable).toBe(true);
        });
    });

    // ===== Tensor Fusion Controller 检查 =====
    test('验证 Tensor Fusion Controller 运行状态', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('检查 Controller Deployment', async () => {
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

    // ===== GPUPool 检查 =====
    test('验证 GPUPool 存在且就绪', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('检查 GPUPool 存在', async () => {
            const pool = gpupool(kubectl, TEST_GPU_POOL);
            await expect(pool).toExistInCluster();
        });

        await step('检查 GPUPool 状态', async () => {
            const pool = gpupool(kubectl, TEST_GPU_POOL);
            await expect(pool).toHaveStatusField('phase', 'Running');
        });
    });

    // ===== GPU 资源检查 =====
    test('验证 GPU 资源充足', async (ctx) => {
        const { kubectl } = ctx.plugins;

        const gpuName = await getFirstGpuName(kubectl);

        await step('检查 GPU 可用资源', async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            const tflopsValue = parseTflops(available.tflops);

            // 验证资源满足测试要求 (至少 2000m TFlops)
            expect(tflopsValue).toBeGreaterThanOrEqual(2000);
        });

        await step('检查 GPU 状态', async () => {
            const exists = await kubectl.exists('gpu', gpuName);
            expect(exists).toBe(true);
        });
    });
});
