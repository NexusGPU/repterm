/**
 * 测试场景 4: 资源释放验证
 *
 * 验证删除 TensorFusionWorkload 后：
 * - GPU 资源正确释放
 * - 可用资源恢复到初始值
 * - 关联的 Worker Pod 被清理
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/04-release.ts
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
    cleanup,
    parseTflops,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-release';

describe('测试场景 4: 资源释放验证', { record: true }, () => {
    let gpuName: string;
    let initialTflops: string;
    let allocatedTflops: string;

    // ===== Step 1: 记录初始状态 =====
    test('Step 1: 记录初始 GPU 资源状态', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('清理可能存在的旧资源', async () => {
            await cleanup(kubectl, [
                { kind: 'tensorfusionworkload', name: WORKLOAD_NAME },
            ]);
            await new Promise(resolve => setTimeout(resolve, 3000));
        });

        await step('获取测试 GPU', async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('记录初始可用资源', async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
        });
    });

    // ===== Step 2: 创建并等待 Workload 就绪 =====
    test('Step 2: 创建 TensorFusionWorkload 并等待就绪', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('创建 Workload', async () => {
            const yaml = workloadYaml(WORKLOAD_NAME, {
                tflopsRequest: '1000m',
                tflopsLimit: '2000m',
                vramRequest: '1Gi',
                vramLimit: '2Gi',
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        await step('等待 Workload 就绪', async () => {
            await kubectl.wait(
                'tensorfusionworkload',
                WORKLOAD_NAME,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
        });

        await step('记录分配后的资源', async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            allocatedTflops = available.tflops;

            const initialNum = parseTflops(initialTflops);
            const allocatedNum = parseTflops(allocatedTflops);

            // 验证资源确实被分配了
            expect(allocatedNum).toBeLessThan(initialNum);
        });
    });

    // ===== Step 3: 确认 Worker Pod 存在 =====
    test('Step 3: 确认 Worker Pod 存在', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('查找 Worker Pod', async () => {
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

    // ===== Step 4: 删除 Workload =====
    test('Step 4: 删除 TensorFusionWorkload', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('删除 Workload', async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
        });

        await step('等待 Workload 删除完成', async () => {
            const startTime = Date.now();
            const timeout = 30000;

            while (Date.now() - startTime < timeout) {
                const exists = await kubectl.exists('tensorfusionworkload', WORKLOAD_NAME);
                if (!exists) {
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // 超时后断言 workload 不存在
            const exists = await kubectl.exists('tensorfusionworkload', WORKLOAD_NAME);
            expect(exists).toBe(false);
        });
    });

    // ===== Step 5: 验证资源释放 =====
    test('Step 5: 验证 GPU 资源已释放', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('等待资源释放', async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));
        });

        await step('检查 GPU 可用资源', async () => {
            const releasedAvailable = await getGpuAvailable(kubectl, gpuName);

            const initialNum = parseTflops(initialTflops);
            const releasedNum = parseTflops(releasedAvailable.tflops);

            // 验证资源已恢复（允许小误差）
            expect(Math.abs(releasedNum - initialNum)).toBeLessThan(100);
        });
    });

    // ===== Step 6: 验证 Worker Pod 已清理 =====
    test('Step 6: 验证 Worker Pod 已清理', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('检查 Worker Pod', async () => {
            const pods = await kubectl.get<{
                items: Array<{
                    metadata: { name: string };
                    status: { phase: string };
                }>;
            }>('pod', undefined, { selector: `tensor-fusion.ai/workload=${WORKLOAD_NAME}` });

            // Worker Pod 应该已被删除
            expect(pods.items?.length ?? 0).toBe(0);
        });
    });

    // ===== Step 7: 验证 Workload 不存在 =====
    test('Step 7: 确认 Workload 已完全删除', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await step('验证 Workload 不存在', async () => {
            const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
            await expect(workload).toNotExistInCluster();
        });
    });
});
