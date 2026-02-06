/**
 * 测试场景 1: 正常资源分配 - 使用 TensorFusionWorkload
 *
 * 验证通过创建 TensorFusionWorkload 可以：
 * - 正确分配 GPU 资源
 * - Workload 状态变为 Running
 * - GPU 可用资源正确减少
 * - Worker Pod 包含正确的 annotations
 *
 * 运行方式:
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

describe('测试场景 1: 正常资源分配 - TensorFusionWorkload', { record: true }, () => {
    test('TensorFusionWorkload 资源分配完整流程', async (ctx) => {
        const { kubectl } = ctx.plugins;
        let gpuName: string;
        let initialTflops: string;

        // ===== Step 1: 记录初始状态 =====
        await step('获取测试 GPU', {
            showStepTitle: false,
            typingSpeed: 60,  // 准备阶段快速执行
            pauseAfter: 1000
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('记录初始可用资源', {
            typingSpeed: 60,
            pauseAfter: 1500  // 让观众看清初始状态
        }, async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
        });

        // ===== Step 2: 创建资源（核心操作）=====
        await step('创建 Workload', {
            showStepTitle: false,
            typingSpeed: 100,  // 核心操作慢速打字
            pauseAfter: 3000   // 重要输出，多停留
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

        // ===== Step 3: 等待 Workload 就绪 =====
        await step('等待 Ready 条件', {
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

        await step('验证 Workload 状态为 Running', {
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const workload = tensorfusionworkload(kubectl, WORKLOAD_NAME);
            await expect(workload).toHaveStatusField('phase', 'Running');
        });

        // ===== Step 4: 验证资源分配结果 =====
        await step('检查 GPU 可用资源变化', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2500  // 验证结果需要阅读时间
        }, async () => {
            sleep(1000)
            const afterAvailable = await getGpuAvailable(kubectl, gpuName);

            const initialTflopsNum = parseTflops(initialTflops);
            const afterTflopsNum = parseTflops(afterAvailable.tflops);

            // TFlops 应该减少
            expect(afterTflopsNum).toBeLessThan(initialTflopsNum);
        });

        await step('验证 Workload readyWorkers', {
            pauseAfter: 1500
        }, async () => {
            const status = await kubectl.getJsonPath<{
                phase?: string;
                readyWorkers?: number;
            }>('tensorfusionworkload', WORKLOAD_NAME, '.status');

            expect(status?.phase).toBe('Running');
            expect(status?.readyWorkers).toBe(1);
        });

        // ===== Step 5: 验证 Worker Pod =====
        await step('查找并验证 Worker Pod', {
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

            // 验证 annotations 存在
            const annotations = workerPod.annotations ?? {};
            expect(annotations['tensor-fusion.ai/tflops-request']).toBeDefined();
            expect(annotations['tensor-fusion.ai/vram-request']).toBeDefined();
        });

        // ===== Step 6: 查看 TensorFusionConnection (如果使用 remote vGPU) =====
        await step('查询关联的 Connection', {
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

                // Connection 可能不存在（local GPU 模式），这不是错误
                if (connections && connections.length > 0) {
                    for (const conn of connections) {
                        expect(conn.phase).toBeDefined();
                    }
                }
            } catch {
                // TensorFusionConnection CRD 可能不存在
            }
        });

        // ===== 清理 =====
        await step('删除 TensorFusionWorkload', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
        });

        await step('等待资源释放并验证', {
            pauseAfter: 2000
        }, async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 验证资源已释放（TFlops 应该恢复）
            const afterRelease = await getGpuAvailable(kubectl, gpuName);
            const releasedTflops = parseTflops(afterRelease.tflops);
            const initialTflopsNum = parseTflops(initialTflops);

            // 允许小误差，但应该接近初始值
            expect(releasedTflops).toBeGreaterThanOrEqual(initialTflopsNum - 100);
        });
    });
});
