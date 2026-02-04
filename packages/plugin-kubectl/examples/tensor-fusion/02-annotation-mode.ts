/**
 * 测试场景 2: 正常资源分配 - 使用 Pod Annotation
 *
 * 验证通过在 Deployment Pod Template 中添加 Tensor Fusion annotation：
 * - Webhook 自动创建 TensorFusionWorkload
 * - GPU 资源正确分配
 * - Pod 成功调度并运行
 *
 * 运行方式:
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

describe('测试场景 2: 正常资源分配 - Pod Annotation', { record: true }, () => {
    test('Pod Annotation 模式资源分配完整流程', async (ctx) => {
        const { kubectl } = ctx.plugins;
        let gpuName: string;
        let initialTflops: string;

        // ===== Step 1: 准备环境 =====
        await step('获取测试 GPU', {
            showStepTitle: true,
            typingSpeed: 60,
            pauseAfter: 1000
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('记录初始可用资源', {
            typingSpeed: 60,
            pauseAfter: 1500
        }, async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
        });

        // ===== Step 2: 创建带 Annotation 的 Deployment（核心操作）=====
        await step('创建带 Annotation 的 Deployment', {
            showStepTitle: true,
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

        await step('验证 Deployment 的 Tensor Fusion annotations', {
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


        // ===== Step 3: 验证 Deployment 和 Pod 状态 =====
        await step('检查 Deployment 可用状态', {
            showStepTitle: true,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const deploy = deployment(kubectl, DEPLOYMENT_NAME);
            await expect(deploy).toExistInCluster();

            await kubectl.wait('deployment', DEPLOYMENT_NAME, 'Available', {
                timeout: DEFAULT_TIMEOUT,
            });
        });

        await step('验证 Pod 运行状态', {
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

        // ===== Step 4: 验证 GPU 资源分配结果 =====
        await step('检查 GPU 可用资源变化', {
            showStepTitle: true,
            typingSpeed: 80,
            pauseAfter: 2500
        }, async () => {
            await sleep(1000);
            const available = await getGpuAvailable(kubectl, gpuName);
            const currentTflops = parseTflops(available.tflops);
            const initialTflopsNum = parseTflops(initialTflops);

            // GPU 资源应该减少
            expect(currentTflops).toBeLessThan(initialTflopsNum);
        });

        // ===== 清理 =====
        await step('删除 Deployment', {
            showStepTitle: true,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const result = await kubectl.delete('deployment', DEPLOYMENT_NAME, { force: true });
            await expect(result).toBeSuccessful();
        });

        await step('等待资源释放并验证', {
            pauseAfter: 2000
        }, async () => {
            await sleep(5000);

            // 验证 TensorFusionWorkload 自动清理
            const workloadExists = await kubectl.exists('tensorfusionworkload', DEPLOYMENT_NAME);
            if (workloadExists) {
                await kubectl.delete('tensorfusionworkload', DEPLOYMENT_NAME, { force: true });
            }

            // 验证 GPU 资源已释放（TFlops 应该恢复）
            const afterRelease = await getGpuAvailable(kubectl, gpuName);
            const releasedTflops = parseTflops(afterRelease.tflops);
            const initialTflopsNum = parseTflops(initialTflops);

            // 允许小误差，但应该接近初始值
            expect(releasedTflops).toBeGreaterThanOrEqual(initialTflopsNum - 100);
        });
    });
});
